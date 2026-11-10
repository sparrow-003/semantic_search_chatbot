import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type {
  ConversationContext,
  RankedEvent,
  SearchFilters,
  SearchMode,
} from "@/lib/events/types";
import type { DashboardConfig, UIResponse } from "@/lib/ui/schema";
import { apiFetch, type ChatTurnResult, type WorkspaceItem } from "./api";

export interface LocalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: "search" | "conversation";
  uiSpec?: UIResponse;
  events?: RankedEvent[];
  streaming?: boolean;
  context?: ConversationContext;
  semanticAvailable?: boolean;
  lowConfidence?: boolean;
  modelUsed?: string;
  followUpSuggestions?: string[];
  securityNotice?: string;
  runtimeNotice?: string;
  executionMode?: "server" | "browser";
  latencyMs?: number;
  createdAt: string;
}

export interface LocalChatSession {
  id: string;
  title: string;
  isSaved: boolean;
  workspaceId: string | null;
  messages: LocalChatMessage[];
  updatedAt: string;
}

export interface SavedSearchPreset {
  id: string;
  name: string;
  query: string;
  mode: SearchMode;
  filters: SearchFilters;
  createdAt: string;
}

export interface LocalDashboardDraft {
  id: string;
  name: string;
  visibility: "private" | "workspace";
  configuration: DashboardConfig;
  updatedAt: string;
}

interface ProfileState {
  displayName: string;
  avatarUrl: string | null;
}

interface WorkspaceContextValue {
  user: User | null;
  session: Session | null;
  authReady: boolean;
  profile: ProfileState | null;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  refreshWorkspaces: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
  // Guest / local session & dashboard & bookmark persistence
  localSessions: LocalChatSession[];
  saveLocalSession: (s: LocalChatSession) => void;
  deleteLocalSession: (id: string) => void;
  savedSearches: SavedSearchPreset[];
  saveSearchPreset: (preset: Omit<SavedSearchPreset, "id" | "createdAt">) => void;
  removeSearchPreset: (id: string) => void;
  bookmarkedEventIds: string[];
  toggleBookmarkEvent: (id: string) => void;
  localDashboards: LocalDashboardDraft[];
  saveLocalDashboard: (name: string, config: DashboardConfig) => LocalDashboardDraft;
  deleteLocalDashboard: (id: string) => void;
  // Inspectors
  inspectedEvent: RankedEvent | null;
  setInspectedEvent: (ev: RankedEvent | null) => void;
  canvasSpec: { title: string; spec: UIResponse; events: RankedEvent[] } | null;
  setCanvasSpec: (c: { title: string; spec: UIResponse; events: RankedEvent[] } | null) => void;
  // Pending chat jump (e.g. from Search page -> Chat Workspace)
  pendingChatPrompt: string | null;
  setPendingChatPrompt: (q: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const LS_KEYS = {
  theme: "scout_theme",
  workspace: "scout_active_workspace",
  sessions: "scout_local_sessions_v1",
  searches: "scout_saved_searches_v1",
  bookmarks: "scout_bookmarks_v1",
  dashboards: "scout_local_dashboards_v1",
} as const;

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, val: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore storage quota errors
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [localSessions, setLocalSessions] = useState<LocalChatSession[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchPreset[]>([]);
  const [bookmarkedEventIds, setBookmarkedEventIds] = useState<string[]>([]);
  const [localDashboards, setLocalDashboards] = useState<LocalDashboardDraft[]>([]);

  const [inspectedEvent, setInspectedEvent] = useState<RankedEvent | null>(null);
  const [canvasSpec, setCanvasSpec] = useState<{
    title: string;
    spec: UIResponse;
    events: RankedEvent[];
  } | null>(null);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);

  useEffect(() => {
    const initialTheme = readStorage<"light" | "dark">(LS_KEYS.theme, "light");
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");

    setLocalSessions(readStorage<LocalChatSession[]>(LS_KEYS.sessions, []));
    setSavedSearches(readStorage<SavedSearchPreset[]>(LS_KEYS.searches, []));
    setBookmarkedEventIds(readStorage<string[]>(LS_KEYS.bookmarks, []));
    setLocalDashboards(readStorage<LocalDashboardDraft[]>(LS_KEYS.dashboards, []));
    const savedWs = readStorage<string | null>(LS_KEYS.workspace, null);
    if (savedWs) setActiveWorkspaceIdState(savedWs);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      let avatarSignedUrl: string | null = data.avatar_url;
      if (data.avatar_url && !data.avatar_url.startsWith("http")) {
        const { data: signed } = await supabase.storage
          .from("avatars")
          .createSignedUrl(data.avatar_url, 3600);
        avatarSignedUrl = signed?.signedUrl ?? null;
      }
      setProfile({
        displayName: data.display_name || user.email?.split("@")[0] || "User",
        avatarUrl: avatarSignedUrl,
      });
    } else {
      setProfile({
        displayName: user.email?.split("@")[0] || "User",
        avatarUrl: null,
      });
    }
  }, [user]);

  const refreshWorkspaces = useCallback(async () => {
    if (!session?.access_token) {
      setWorkspaces([]);
      return;
    }
    try {
      const res = await apiFetch<{ workspaces: WorkspaceItem[] }>("/api/v1/workspaces");
      setWorkspaces(res.workspaces);
    } catch {
      try {
        const memberships = await supabase
          .from("tenant_members")
          .select("tenant_id, role")
          .eq("user_id", session.user.id);
        if (memberships.error) throw new Error(memberships.error.message);
        const tenantIds = (memberships.data ?? []).map((membership) => membership.tenant_id);
        if (!tenantIds.length) {
          setWorkspaces([]);
          return;
        }
        const tenants = await supabase
          .from("tenants")
          .select("id, name, created_by, created_at")
          .in("id", tenantIds);
        if (tenants.error) throw new Error(tenants.error.message);
        setWorkspaces(
          (tenants.data ?? []).map((tenant) => ({
            id: tenant.id,
            name: tenant.name,
            created_by: tenant.created_by,
            created_at: tenant.created_at,
            role:
              memberships.data?.find((membership) => membership.tenant_id === tenant.id)?.role ??
              "member",
          })),
        );
      } catch {
        setWorkspaces([]);
      }
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: () => void = () => {};
    try {
      const auth = supabase.auth;
      void auth
        .getSession()
        .then(({ data }) => {
          if (!mounted) return;
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setAuthReady(true);
        })
        .catch(() => {
          if (mounted) setAuthReady(true);
        });
      const { data: listener } = auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setAuthReady(true);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    } catch {
      setAuthReady(true);
    }
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      void refreshProfile();
      void refreshWorkspaces();
    } else {
      setProfile(null);
      setWorkspaces([]);
      setActiveWorkspaceIdState(null);
    }
  }, [user, refreshProfile, refreshWorkspaces]);

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActiveWorkspaceIdState(id);
    writeStorage(LS_KEYS.workspace, id);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setActiveWorkspaceId(null);
  }, [setActiveWorkspaceId]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      writeStorage(LS_KEYS.theme, next);
      return next;
    });
  }, []);

  const saveLocalSession = useCallback((s: LocalChatSession) => {
    setLocalSessions((prev) => {
      const next = [s, ...prev.filter((item) => item.id !== s.id)].slice(0, 25);
      writeStorage(LS_KEYS.sessions, next);
      return next;
    });
  }, []);

  const deleteLocalSession = useCallback((id: string) => {
    setLocalSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      writeStorage(LS_KEYS.sessions, next);
      return next;
    });
  }, []);

  const saveSearchPreset = useCallback((preset: Omit<SavedSearchPreset, "id" | "createdAt">) => {
    setSavedSearches((prev) => {
      const next: SavedSearchPreset[] = [
        { ...preset, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
        ...prev,
      ].slice(0, 25);
      writeStorage(LS_KEYS.searches, next);
      return next;
    });
  }, []);

  const removeSearchPreset = useCallback((id: string) => {
    setSavedSearches((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeStorage(LS_KEYS.searches, next);
      return next;
    });
  }, []);

  const toggleBookmarkEvent = useCallback((id: string) => {
    setBookmarkedEventIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      writeStorage(LS_KEYS.bookmarks, next);
      return next;
    });
  }, []);

  const saveLocalDashboard = useCallback((name: string, configuration: DashboardConfig) => {
    const draft: LocalDashboardDraft = {
      id: crypto.randomUUID(),
      name,
      visibility: "private",
      configuration,
      updatedAt: new Date().toISOString(),
    };
    setLocalDashboards((prev) => {
      const next = [draft, ...prev].slice(0, 20);
      writeStorage(LS_KEYS.dashboards, next);
      return next;
    });
    return draft;
  }, []);

  const deleteLocalDashboard = useCallback((id: string) => {
    setLocalDashboards((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeStorage(LS_KEYS.dashboards, next);
      return next;
    });
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        user,
        session,
        authReady,
        profile,
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        refreshWorkspaces,
        refreshProfile,
        signOut,
        theme,
        toggleTheme,
        localSessions,
        saveLocalSession,
        deleteLocalSession,
        savedSearches,
        saveSearchPreset,
        removeSearchPreset,
        bookmarkedEventIds,
        toggleBookmarkEvent,
        localDashboards,
        saveLocalDashboard,
        deleteLocalDashboard,
        inspectedEvent,
        setInspectedEvent,
        canvasSpec,
        setCanvasSpec,
        pendingChatPrompt,
        setPendingChatPrompt,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function turnResultToAssistantMessage(res: ChatTurnResult): LocalChatMessage {
  return {
    id: res.messageId,
    role: "assistant",
    content: res.answer,
    kind: res.kind,
    ...(res.uiSpec ? { uiSpec: res.uiSpec } : {}),
    events: res.events,
    context: res.context,
    semanticAvailable: res.semanticAvailable,
    lowConfidence: res.lowConfidence,
    modelUsed: res.modelUsed,
    followUpSuggestions: res.followUpSuggestions,
    ...(res.securityNotice ? { securityNotice: res.securityNotice } : {}),
    ...(res.runtimeNotice ? { runtimeNotice: res.runtimeNotice } : {}),
    ...(res.executionMode ? { executionMode: res.executionMode } : {}),
    latencyMs: res.latencyMs,
    createdAt: new Date().toISOString(),
  };
}
