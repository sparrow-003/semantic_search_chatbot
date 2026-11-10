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
  kind: "search" | "conversation";
  uiSpec: UIResponse | null;
  events: RankedEvent[];
  context: ConversationContext;
  semanticAvailable: boolean;
  lowConfidence: boolean;
  modelUsed: string;
  followUpSuggestions: string[];
  securityNotice?: string;
  runtimeNotice?: string;
  executionMode?: "server" | "browser";
  latencyMs: number;
}

export type ChatTurnPartial = Pick<
  ChatTurnResult,
  | "kind"
  | "uiSpec"
  | "events"
  | "context"
  | "semanticAvailable"
  | "lowConfidence"
  | "followUpSuggestions"
>;

export async function sendChatMessageStream(
  payload: {
    message: string;
    sessionId?: string | null;
    workspaceId?: string | null;
    mode?: SearchMode;
    model?: string | null;
    provider?: "lovable" | "openrouter";
    chatMode?: "auto" | "search" | "chat";
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    explicitFilters?: Partial<SearchFilters>;
    context?: ConversationContext | null;
    prevTableConfig?: DataTableConfig | null;
  },
  callbacks: {
    onStatus?: (stage: string) => void;
    onPartial?: (partial: ChatTurnPartial) => void;
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
    openRouterKey?: string | null;
  } = {},
): Promise<ChatTurnResult> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch("/api/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders,
      ...(payload.provider === "openrouter" && callbacks.openRouterKey
        ? { "x-openrouter-key": callbacks.openRouterKey }
        : {}),
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
      } else if (eventType === "delta" && typeof parsed["text"] === "string") {
        callbacks.onDelta?.(parsed["text"]);
      } else if (eventType === "partial") {
        callbacks.onPartial?.(parsed as unknown as ChatTurnPartial);
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

export interface OpenRouterModelItem {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  inputModalities: string[];
  isRouter: boolean;
}

export interface OpenRouterKeyDetails {
  label: string | null;
  isFreeTier: boolean;
  limit: number | null;
  limitRemaining: number | null;
  usage: number | null;
}

/** Validate the user's OpenRouter key and list the free models it can use. */
export async function fetchOpenRouterModels(
  apiKey: string,
): Promise<{ key: OpenRouterKeyDetails; models: OpenRouterModelItem[] }> {
  try {
    return await apiFetch("/api/v1/openrouter/models", {
      method: "POST",
      headers: { "x-openrouter-key": apiKey.trim() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      !(err instanceof TypeError) &&
      !/failed to fetch|networkerror|load failed|Request failed \((404|500|502|503|504)\)/i.test(
        message,
      )
    ) {
      throw err;
    }

    const openRouterHeaders = {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    };
    const [keyResponse, modelsResponse] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/key", { headers: openRouterHeaders }),
      fetch("https://openrouter.ai/api/v1/models"),
    ]);
    const keyText = await keyResponse.text();
    const modelsText = await modelsResponse.text();
    if (!keyResponse.ok) {
      let detail = "";
      try {
        const body = JSON.parse(keyText) as { error?: { message?: string } };
        detail = body.error?.message ?? "";
      } catch {
        detail = "";
      }
      throw new Error(
        keyResponse.status === 401 || keyResponse.status === 403
          ? "OpenRouter rejected your API key. Check the key and try again."
          : detail || `OpenRouter key check failed (${keyResponse.status}).`,
      );
    }
    if (!modelsResponse.ok) throw new Error(`Could not load OpenRouter models (${modelsResponse.status}).`);

    const keyBody = JSON.parse(keyText) as {
      data?: {
        label?: unknown;
        is_free_tier?: unknown;
        limit?: unknown;
        limit_remaining?: unknown;
        usage?: unknown;
      };
    };
    const modelsBody = JSON.parse(modelsText) as {
      data?: Array<{
        id?: unknown;
        name?: unknown;
        description?: unknown;
        context_length?: unknown;
        pricing?: { prompt?: unknown; completion?: unknown; request?: unknown };
        architecture?: { input_modalities?: unknown; output_modalities?: unknown };
      }>;
    };
    const models = (modelsBody.data ?? [])
      .filter((model) => {
        if (typeof model.id !== "string") return false;
        const price = model.pricing ?? {};
        const zero = (value: unknown) =>
          value === undefined || value === null || (Number.isFinite(Number(value)) && Number(value) === 0);
        if (!zero(price.prompt) || !zero(price.completion) || !zero(price.request)) return false;
        if (price.prompt === undefined && price.completion === undefined && model.id !== "openrouter/free") {
          return false;
        }
        const output = model.architecture?.output_modalities;
        return !Array.isArray(output) || output.includes("text");
      })
      .map((model) => ({
        id: model.id as string,
        name: typeof model.name === "string" ? model.name : (model.id as string),
        description: typeof model.description === "string" ? model.description.slice(0, 240) : "",
        contextLength: typeof model.context_length === "number" ? model.context_length : null,
        inputModalities: Array.isArray(model.architecture?.input_modalities)
          ? model.architecture.input_modalities.filter((value): value is string => typeof value === "string")
          : ["text"],
        isRouter: model.id === "openrouter/free",
      }))
      .sort((a, b) => (a.isRouter === b.isRouter ? a.name.localeCompare(b.name) : a.isRouter ? -1 : 1));
    const keyData = keyBody.data ?? {};
    return {
      key: {
        label: typeof keyData.label === "string" ? keyData.label : null,
        isFreeTier: keyData.is_free_tier === true,
        limit: typeof keyData.limit === "number" ? keyData.limit : null,
        limitRemaining: typeof keyData.limit_remaining === "number" ? keyData.limit_remaining : null,
        usage: typeof keyData.usage === "number" ? keyData.usage : null,
      },
      models,
    };
  }
}
