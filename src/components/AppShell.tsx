import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  Compass,
  FolderKanban,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import scoutLogo from "@/assets/scout-logo.png";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { apiFetch, type ChatSessionItem, type SavedDashboardItem } from "@/lib/client/api";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/client/workspace-context";
import {
  hasCompletedModelSettingsSetup,
  markModelSettingsSetupComplete,
} from "@/lib/client/model-settings";
import { ModelSettingsDialog } from "./ModelSettingsDialog";
import { CanvasInspectorSheet } from "./CanvasInspectorSheet";
import { EventDetailSheet } from "./EventDetailSheet";

export function AppShell({
  children,
  onSelectSession,
  activeSessionId,
  onNewChat,
  modelSettingsOpen: controlledModelSettingsOpen,
  onModelSettingsOpenChange,
  onModelSettingsSetupComplete,
}: {
  children: React.ReactNode;
  onSelectSession?: (id: string) => void;
  activeSessionId?: string | null;
  onNewChat?: () => void;
  modelSettingsOpen?: boolean;
  onModelSettingsOpenChange?: (open: boolean) => void;
  onModelSettingsSetupComplete?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    user,
    profile,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    signOut,
    theme,
    toggleTheme,
    localSessions,
    deleteLocalSession,
    localDashboards,
    setPendingChatPrompt,
  } = useWorkspace();

  const [sessionFilter, setSessionFilter] = useState("");
  const [localModelSettingsOpen, setLocalModelSettingsOpen] = useState(false);
  const modelSettingsOpen = controlledModelSettingsOpen ?? localModelSettingsOpen;
  const setModelSettingsOpen = useCallback(
    (open: boolean) => {
      if (controlledModelSettingsOpen === undefined) setLocalModelSettingsOpen(open);
      onModelSettingsOpenChange?.(open);
      if (!open) {
        markModelSettingsSetupComplete();
        onModelSettingsSetupComplete?.();
      }
    },
    [controlledModelSettingsOpen, onModelSettingsOpenChange, onModelSettingsSetupComplete],
  );

  useEffect(() => {
    if (location.pathname === "/" && !hasCompletedModelSettingsSetup()) {
      setModelSettingsOpen(true);
    }
  }, [location.pathname, setModelSettingsOpen]);

  const { data: remoteSessions } = useQuery({
    queryKey: ["chat-sessions", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      try {
        return await apiFetch<{ sessions: ChatSessionItem[] }>("/api/v1/chat/sessions");
      } catch {
        const { data, error } = await supabase
          .from("chat_sessions")
          .select("id, title, is_saved, tenant_id, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        if (error) throw new Error(error.message);
        return { sessions: (data ?? []) as ChatSessionItem[] };
      }
    },
  });

  const { data: remoteDashboards } = useQuery({
    queryKey: ["saved-dashboards", user?.id, activeWorkspaceId],
    enabled: Boolean(user),
    queryFn: async () => {
      try {
        return await apiFetch<{ dashboards: SavedDashboardItem[] }>(
          activeWorkspaceId
            ? `/api/v1/dashboards?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
            : "/api/v1/dashboards",
        );
      } catch {
        let query = supabase
          .from("saved_dashboards")
          .select("id, tenant_id, owner_id, name, visibility, configuration, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        if (activeWorkspaceId) query = query.eq("tenant_id", activeWorkspaceId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return { dashboards: (data ?? []) as SavedDashboardItem[] };
      }
    },
  });

  const remoteSessionItems = (remoteSessions?.sessions ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        isSaved: s.is_saved,
        updatedAt: s.updated_at,
        remote: true,
      }));
  const remoteSessionIds = new Set(remoteSessionItems.map((s) => s.id));
  const localSessionItems = localSessions
    .filter((s) => !remoteSessionIds.has(s.id))
    .map((s) => ({
        id: s.id,
        title: s.title,
        isSaved: s.isSaved,
        updatedAt: s.updatedAt,
        remote: false,
      }));
  const combinedSessions = user
    ? [...remoteSessionItems, ...localSessionItems]
    : localSessionItems;

  const filteredSessions = combinedSessions.filter((s) =>
    !sessionFilter.trim()
      ? true
      : s.title.toLowerCase().includes(sessionFilter.trim().toLowerCase()),
  );

  const dashboardLinks = user
    ? (remoteDashboards?.dashboards ?? []).slice(0, 5).map((d) => ({ id: d.id, name: d.name }))
    : localDashboards.slice(0, 5).map((d) => ({ id: d.id, name: d.name }));

  const navItems = [
    { to: "/", label: "AI Workspace", icon: MessageSquare },
    { to: "/search", label: "Search Explorer", icon: Compass },
    { to: "/dashboards", label: "Dashboards & Reports", icon: LayoutDashboard },
    { to: "/workspace", label: "Team & Events", icon: FolderKanban },
    { to: "/admin", label: "Observability & Index", icon: Activity },
  ] as const;

  const handleDeleteSession = async (id: string, remote: boolean) => {
    if (remote) {
      try {
        await apiFetch(`/api/v1/chat/sessions/${id}`, { method: "DELETE" });
      } catch {
        const { error } = await supabase.from("chat_sessions").delete().eq("id", id);
        if (error) throw new Error(error.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    } else {
      deleteLocalSession(id);
    }
    if (activeSessionId === id && onNewChat) onNewChat();
  };

  return (
    <SidebarProvider>
      <a
        href="#main-workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:text-primary-foreground"
      >
        Skip to workspace content
      </a>

      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
              <img
                src={scoutLogo}
                alt="Scout logo"
                className="size-7 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-bold tracking-tight">Scout</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  Semantic AI Workspace
                </div>
              </div>
            </Link>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 group-data-[collapsible=icon]:hidden"
              title="New conversation"
              onClick={() => {
                if (onNewChat) onNewChat();
                else void navigate({ to: "/" });
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace Views</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to}>
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Conversations</SidebarGroupLabel>
            <SidebarGroupContent className="space-y-2 px-2">
              <div className="relative">
                <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
                <Input
                  aria-label="Search conversations"
                  placeholder="Search chats..."
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
              </div>

              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {!filteredSessions.length ? (
                  <p className="px-2 py-2 text-[11px] text-muted-foreground">
                    No conversations yet. Start asking questions in the workspace.
                  </p>
                ) : (
                  filteredSessions.slice(0, 15).map((s) => (
                    <div
                      key={s.id}
                      className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                        activeSessionId === s.id
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/60"
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={() => {
                          if (onSelectSession && location.pathname === "/") {
                            onSelectSession(s.id);
                          } else {
                            void navigate({ to: "/", search: { session: s.id } as never });
                          }
                        }}
                      >
                        {s.title}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${s.title}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleDeleteSession(s.id, s.remote)}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Saved Dashboards & Templates</SidebarGroupLabel>
            <SidebarGroupContent className="space-y-1 px-2">
              {dashboardLinks.map((d) => (
                <Link
                  key={d.id}
                  to="/dashboards/$id"
                  params={{ id: d.id }}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  <LayoutDashboard className="size-3.5 shrink-0" />
                  <span className="truncate">{d.name}</span>
                </Link>
              ))}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-primary hover:bg-sidebar-accent"
                onClick={() => {
                  setPendingChatPrompt(
                    "Find all online React and Next.js events next month, compare them by date and category, and show me an analytics dashboard.",
                  );
                  if (location.pathname !== "/") void navigate({ to: "/" });
                }}
              >
                <Sparkles className="size-3.5 shrink-0" />
                <span className="truncate">Template: React Analytics</span>
              </button>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:p-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto w-full justify-start gap-2.5 px-2 py-1.5">
                  <Avatar className="size-7 shrink-0">
                    <AvatarImage src={profile?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {(profile?.displayName ?? user.email ?? "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                    <div className="truncate text-xs font-medium">{profile?.displayName ?? "User"}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs">Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="gap-2 text-xs">
                    <UserIcon className="size-3.5" /> Profile & Avatar
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/workspace" className="gap-2 text-xs">
                    <Building2 className="size-3.5" /> Workspaces
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-xs text-destructive"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" variant="outline" className="w-full justify-start gap-2 text-xs">
              <Link to="/auth">
                <LogIn className="size-3.5 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Sign in / Save work</span>
              </Link>
            </Button>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <SidebarTrigger aria-label="Toggle navigation sidebar" />
            <div className="hidden items-center gap-2 sm:flex">
              <Building2 className="size-3.5 text-muted-foreground" />
              <Select
                value={activeWorkspaceId ?? "public"}
                onValueChange={(v) => setActiveWorkspaceId(v === "public" ? null : v)}
              >
                <SelectTrigger className="h-7 w-[195px] text-xs" aria-label="Active dataset scope">
                  <SelectValue placeholder="Public Event Catalog" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public Event Catalog</SelectItem>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name} ({ws.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden text-[11px] sm:inline-flex">
              {activeWorkspaceId ? "Workspace Scoped" : "Public Events"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="AI model settings"
              title="AI model settings"
              onClick={() => setModelSettingsOpen(true)}
            >
              <Settings2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </header>

        <main id="main-workspace" className="flex flex-1 flex-col">
          {children}
        </main>
      </SidebarInset>

      <EventDetailSheet />
      <CanvasInspectorSheet />
      <ModelSettingsDialog open={modelSettingsOpen} onOpenChange={setModelSettingsOpen} />
    </SidebarProvider>
  );
}

