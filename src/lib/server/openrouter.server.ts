/**
 * OpenRouter integration for users who bring their own (free) OpenRouter key.
 * The key arrives per request from the user's browser and is forwarded only
 * to openrouter.ai — it is never stored, logged or returned.
 */
import { HttpError } from "./supabase.server";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_KEY_HEADER = "x-openrouter-key";
export const OPENROUTER_FREE_ROUTER = "openrouter/free";

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  inputModalities: string[];
  isRouter: boolean;
}

export interface OpenRouterKeyInfo {
  label: string | null;
  isFreeTier: boolean;
  limit: number | null;
  limitRemaining: number | null;
  usage: number | null;
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown; request?: unknown };
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
}

export function isValidOpenRouterKeyFormat(key: string | null | undefined): key is string {
  return typeof key === "string" && /^sk-or-[A-Za-z0-9_-]{10,200}$/.test(key.trim());
}

export function isValidOpenRouterModelId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[a-z0-9][a-z0-9._\-/:]{2,119}$/i.test(id);
}

function isZeroPrice(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

/** Keep only free, text-output chat models. Exported for tests. */
export function filterFreeModels(raw: RawModel[]): OpenRouterModelInfo[] {
  const out: OpenRouterModelInfo[] = [];
  for (const m of raw) {
    if (typeof m.id !== "string") continue;
    const p = m.pricing ?? {};
    if (!isZeroPrice(p.prompt) || !isZeroPrice(p.completion) || !isZeroPrice(p.request)) continue;
    if (p.prompt === undefined && p.completion === undefined && m.id !== OPENROUTER_FREE_ROUTER)
      continue;
    const outMods = Array.isArray(m.architecture?.output_modalities)
      ? (m.architecture!.output_modalities as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : ["text"];
    if (!outMods.includes("text")) continue;
    const inMods = Array.isArray(m.architecture?.input_modalities)
      ? (m.architecture!.input_modalities as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : ["text"];
    out.push({
      id: m.id,
      name: typeof m.name === "string" ? m.name : m.id,
      description: typeof m.description === "string" ? m.description.slice(0, 240) : "",
      contextLength: typeof m.context_length === "number" ? m.context_length : null,
      inputModalities: inMods,
      isRouter: m.id === OPENROUTER_FREE_ROUTER,
    });
  }
  // Free router first, then alphabetical
  return out.sort((a, b) =>
    a.isRouter === b.isRouter ? a.name.localeCompare(b.name) : a.isRouter ? -1 : 1,
  );
}

function friendlyOpenRouterError(status: number, bodyText: string): HttpError {
  let detail = "";
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string } };
    detail = j.error?.message ?? "";
  } catch {
    detail = "";
  }
  if (status === 401 || status === 403) {
    return new HttpError(
      401,
      "openrouter_invalid_key",
      "OpenRouter rejected your API key. Check it in Model settings.",
    );
  }
  if (status === 402) {
    return new HttpError(
      402,
      "openrouter_credits",
      "Your OpenRouter account has no credits for this model. Pick a free model or add credits on OpenRouter.",
    );
  }
  if (status === 429) {
    return new HttpError(
      429,
      "openrouter_rate_limited",
      "OpenRouter's free-model limit was reached. Wait a minute, choose another free model, or try again later.",
    );
  }
  if (status === 404) {
    return new HttpError(
      404,
      "openrouter_model_unavailable",
      "That OpenRouter model is not available right now. Choose another free model.",
    );
  }
  return new HttpError(
    502,
    "openrouter_error",
    `OpenRouter request failed${detail ? `: ${detail.slice(0, 160)}` : ` (${status})`}.`,
  );
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://scout.lovable.app",
    "X-Title": "Scout Event Workspace",
  };
}

export async function fetchOpenRouterKeyInfo(apiKey: string): Promise<OpenRouterKeyInfo> {
  const res = await fetch(`${OPENROUTER_BASE}/key`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw friendlyOpenRouterError(res.status, text);
  const j = JSON.parse(text) as {
    data?: {
      label?: unknown;
      is_free_tier?: unknown;
      limit?: unknown;
      limit_remaining?: unknown;
      usage?: unknown;
    };
  };
  const d = j.data ?? {};
  return {
    label: typeof d.label === "string" ? d.label : null,
    isFreeTier: d.is_free_tier === true,
    limit: typeof d.limit === "number" ? d.limit : null,
    limitRemaining: typeof d.limit_remaining === "number" ? d.limit_remaining : null,
    usage: typeof d.usage === "number" ? d.usage : null,
  };
}

export async function fetchOpenRouterFreeModels(): Promise<OpenRouterModelInfo[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models`, { signal: AbortSignal.timeout(12_000) });
  const text = await res.text();
  if (!res.ok) throw friendlyOpenRouterError(res.status, text);
  const j = JSON.parse(text) as { data?: RawModel[] };
  return filterFreeModels(Array.isArray(j.data) ? j.data : []);
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterStreamResult {
  text: string;
  model: string;
  tokens: number;
}

/**
 * Stream a chat completion from OpenRouter, calling onDelta for each text
 * chunk. Reasoning tokens are ignored; only answer content is returned.
 */
export async function streamOpenRouterChat(opts: {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}): Promise<OpenRouterStreamResult> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(opts.apiKey),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1200,
    }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
  });
  if (!res.ok || !res.body) {
    throw friendlyOpenRouterError(res.status, await res.text().catch(() => ""));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = opts.model;
  let tokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue; // skips ": OPENROUTER PROCESSING" comments
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk: {
        model?: string;
        error?: { message?: string; code?: number };
        choices?: Array<{ delta?: { content?: string | null } }>;
        usage?: { total_tokens?: number };
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) {
        throw friendlyOpenRouterError(
          typeof chunk.error.code === "number" ? chunk.error.code : 502,
          JSON.stringify({ error: chunk.error }),
        );
      }
      if (typeof chunk.model === "string") model = chunk.model;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        text += delta;
        opts.onDelta?.(delta);
      }
      if (typeof chunk.usage?.total_tokens === "number") tokens = chunk.usage.total_tokens;
    }
  }
  return { text: text.trim(), model, tokens };
}
