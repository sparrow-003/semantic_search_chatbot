import { supabase } from "@/integrations/supabase/client";
import type {
  ConversationContext,
  Facets,
  RankedEvent,
  SearchFilters,
  SearchMode,
  SearchResponse,
} from "@/lib/events/types";
import type { DashboardConfig, DataTableConfig, UIResponse } from "@/lib/ui/schema";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  for (const [k, v] of Object.entries(authHeaders)) {
    headers.set(k, v);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: { message: text || `HTTP ${res.status}` } };
  }
  if (!res.ok) {
    const errObj = parsed as { error?: { message?: string } };
    throw new Error(errObj?.error?.message ?? `Request failed (${res.status})`);
  }
  return parsed as T;
}

export interface ChatTurnResult {
  sessionId: string | null;
  messageId: string;
  answer: string;
  uiSpec: UIResponse;
  events: RankedEvent[];
  context: ConversationContext;
  semanticAvailable: boolean;
  lowConfidence: boolean;
  modelUsed: string;
  followUpSuggestions: string[];
  securityNotice?: string;
  latencyMs: number;
}

export async function sendChatMessageStream(
  payload: {
    message: string;
    sessionId?: string | null;
    workspaceId?: string | null;
    mode?: SearchMode;
    model?: string | null;
    explicitFilters?: Partial<SearchFilters>;
    context?: ConversationContext | null;
    prevTableConfig?: DataTableConfig | null;
  },
  callbacks: {
    onStatus?: (stage: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ChatTurnResult> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch("/api/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders,
    },
    body: JSON.stringify({ ...payload, stream: true }),
    ...(callbacks.signal ? { signal: callbacks.signal } : {}),
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    let msg = `Chat failed (${res.status})`;
    try {
      const j = JSON.parse(txt) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      if (txt) msg = txt;
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ChatTurnResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame.split("\n");
      let eventType = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      const parsed = JSON.parse(dataLine) as Record<string, unknown>;
      if (eventType === "status" && typeof parsed["stage"] === "string") {
        callbacks.onStatus?.(parsed["stage"]);
      } else if (eventType === "result") {
        finalResult = parsed as unknown as ChatTurnResult;
      } else if (eventType === "error") {
        throw new Error(
          typeof parsed["message"] === "string" ? parsed["message"] : "Chat generation failed",
        );
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended without a response payload.");
  }
  return finalResult;
}

export async function runHybridSearch(payload: {
  query: string;
  mode?: SearchMode;
  filters?: Partial<SearchFilters>;
  freeOnly?: boolean;
  workspaceId?: string | null;
  limit?: number;
}): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/api/v1/search/hybrid", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loadFacets(workspaceId?: string | null): Promise<Facets> {
  const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  return apiFetch<Facets>(`/api/v1/search/facets${q}`);
}

export async function submitSearchFeedback(payload: {
  messageId?: string;
  query?: string;
  rating: "useful" | "irrelevant" | "incorrect_info" | "incorrect_explanation";
  comment?: string;
}): Promise<{ recorded: boolean }> {
  return apiFetch<{ recorded: boolean }>("/api/v1/search/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ChatSessionItem {
  id: string;
  title: string;
  is_saved: boolean;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedDashboardItem {
  id: string;
  tenant_id: string;
  owner_id: string;
  name: string;
  visibility: "private" | "workspace";
  configuration: DashboardConfig;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  created_by: string;
  role: "owner" | "admin" | "editor" | "member" | "viewer";
  created_at: string;
}
