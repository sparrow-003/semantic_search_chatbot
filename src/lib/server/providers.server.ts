import {
  GatewayError,
  generateChatCompletion,
  generateEmbeddings,
  type ChatModels,
} from "@lovable.dev/ai-gateway";
import { recordTelemetry } from "./rate-limit.server";

export const ALLOWED_CHAT_MODELS: ReadonlyArray<{
  id: ChatModels;
  label: string;
  tier: "fast" | "balanced" | "pro";
}> = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", tier: "fast" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", tier: "fast" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "fast" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "pro" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", tier: "balanced" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", tier: "pro" },
];

export const DEFAULT_CHAT_MODEL: ChatModels = "google/gemini-3-flash-preview";
export const EMBEDDING_MODEL = "google/gemini-embedding-001" as const;
export const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  isAvailable(): boolean;
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddingsBatch(texts: string[]): Promise<number[][]>;
}

export interface LLMGenerationResult<T = unknown> {
  data: T;
  model: string;
  tokens: number;
  estimatedCostUsd: number;
}

export interface LLMProvider {
  isAvailable(): boolean;
  generateText(opts: {
    model?: ChatModels;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<LLMGenerationResult<string>>;
  generateStructuredResponse<T>(opts: {
    model?: ChatModels;
    systemPrompt: string;
    userPrompt: string;
    parse: (raw: unknown) => T;
    timeoutMs?: number;
  }): Promise<LLMGenerationResult<T>>;
}

export function resolveAllowedChatModel(requested?: string | null): ChatModels {
  if (!requested) return DEFAULT_CHAT_MODEL;
  const found = ALLOWED_CHAT_MODELS.find((m) => m.id === requested);
  return found ? found.id : DEFAULT_CHAT_MODEL;
}

export function isGatewayConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]?.trim());
}

function estimateCostUsd(model: string, tokens: number): number {
  const perMillion = model.includes("pro") || model.includes("5.4") ? 2.5 : 0.35;
  return Number(((tokens / 1_000_000) * perMillion).toFixed(6));
}

function normalizeGatewayError(err: unknown): { category: string; message: string } {
  if (err instanceof GatewayError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { category: "timeout", message: "AI provider request timed out." };
    }
    return { category: "provider_error", message: err.message };
  }
  return { category: "unknown", message: "AI provider failed." };
}

export const lovableEmbeddingProvider: EmbeddingProvider = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  isAvailable: () => isGatewayConfigured(),

  async generateEmbedding(text: string): Promise<number[]> {
    const batch = await this.generateEmbeddingsBatch([text]);
    const vec = batch[0];
    if (!vec || vec.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embedding, received ${vec?.length ?? 0}`);
    }
    return vec;
  },

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (!isGatewayConfigured()) {
      throw new Error("LOVABLE_API_KEY is not configured.");
    }
    const started = Date.now();
    try {
      const res = await generateEmbeddings(
        {
          model: EMBEDDING_MODEL,
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        {
          signal: AbortSignal.timeout(15_000),
          maxRetries: 1,
        },
      );
      const vectors = res.data
        .sort((a, b) => a.index - b.index)
        .map((item) => {
          if (!Array.isArray(item.embedding)) {
            throw new Error("Gateway returned non-numeric embedding.");
          }
          return item.embedding;
        });
      const tokens = res.usage?.total_tokens ?? 0;
      recordTelemetry({
        kind: "embedding",
        status: "ok",
        latencyMs: Date.now() - started,
        tokens,
        estimatedCostUsd: Number(((tokens / 1_000_000) * 0.1).toFixed(6)),
        model: EMBEDDING_MODEL,
      });
      return vectors;
    } catch (err) {
      const norm = normalizeGatewayError(err);
      recordTelemetry({
        kind: "embedding",
        status: "error",
        latencyMs: Date.now() - started,
        errorCategory: norm.category,
        model: EMBEDDING_MODEL,
      });
      throw new Error(norm.message);
    }
  },
};

export const lovableLLMProvider: LLMProvider = {
  isAvailable: () => isGatewayConfigured(),

  async generateText(opts): Promise<LLMGenerationResult<string>> {
    if (!isGatewayConfigured()) {
      throw new Error("LOVABLE_API_KEY is not configured.");
    }
    const model = resolveAllowedChatModel(opts.model);
    const started = Date.now();
    try {
      const res = await generateChatCompletion(
        {
          model,
          messages: [
            { role: "system", content: opts.systemPrompt },
            { role: "user", content: opts.userPrompt },
          ],
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 900,
        },
        {
          signal: AbortSignal.timeout(opts.timeoutMs ?? 18_000),
          maxRetries: 1,
        },
      );
      const text = res.choices[0]?.message?.content?.trim() ?? "";
      const tokens = res.usage?.total_tokens ?? 0;
      const cost = estimateCostUsd(model, tokens);
      recordTelemetry({
        kind: "llm",
        status: "ok",
        latencyMs: Date.now() - started,
        tokens,
        estimatedCostUsd: cost,
        model,
      });
      return { data: text, model, tokens, estimatedCostUsd: cost };
    } catch (err) {
      const norm = normalizeGatewayError(err);
      recordTelemetry({
        kind: "llm",
        status: "error",
        latencyMs: Date.now() - started,
        errorCategory: norm.category,
        model,
      });
      throw new Error(norm.message);
    }
  },

  async generateStructuredResponse<T>(opts: {
    model?: ChatModels;
    systemPrompt: string;
    userPrompt: string;
    parse: (raw: unknown) => T;
    timeoutMs?: number;
  }): Promise<LLMGenerationResult<T>> {
    if (!isGatewayConfigured()) {
      throw new Error("LOVABLE_API_KEY is not configured.");
    }
    const model = resolveAllowedChatModel(opts.model);
    const started = Date.now();
    try {
      const res = await generateChatCompletion(
        {
          model,
          messages: [
            { role: "system", content: `${opts.systemPrompt}\nReturn strictly valid JSON with no markdown code fences.` },
            { role: "user", content: opts.userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 900,
        },
        {
          signal: AbortSignal.timeout(opts.timeoutMs ?? 14_000),
          maxRetries: 1,
        },
      );
      const content = res.choices[0]?.message?.content?.trim() ?? "{}";
      const parsedJson = JSON.parse(content) as unknown;
      const validated = opts.parse(parsedJson);
      const tokens = res.usage?.total_tokens ?? 0;
      const cost = estimateCostUsd(model, tokens);
      recordTelemetry({
        kind: "llm",
        status: "ok",
        latencyMs: Date.now() - started,
        tokens,
        estimatedCostUsd: cost,
        model,
      });
      return { data: validated, model, tokens, estimatedCostUsd: cost };
    } catch (err) {
      const norm = normalizeGatewayError(err);
      recordTelemetry({
        kind: "llm",
        status: "error",
        latencyMs: Date.now() - started,
        errorCategory: norm.category,
        model,
      });
      throw new Error(norm.message);
    }
  },
};
