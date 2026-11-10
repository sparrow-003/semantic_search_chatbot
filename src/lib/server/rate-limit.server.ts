import { HttpError } from "./supabase.server";

interface Bucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  bucket: string;
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  chat: { bucket: "chat", maxRequests: 30, windowMs: 60_000 },
  search: { bucket: "search", maxRequests: 60, windowMs: 60_000 },
  embeddings: { bucket: "embeddings", maxRequests: 10, windowMs: 60_000 },
  ui: { bucket: "ui", maxRequests: 40, windowMs: 60_000 },
  default: { bucket: "default", maxRequests: 90, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

export function getClientKey(request: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const fwd =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  return `ip:${fwd.slice(0, 64)}`;
}

export function checkRateLimit(key: string, config: RateLimitConfig): void {
  const now = Date.now();
  const mapKey = `${config.bucket}:${key}`;
  const entry = rateBuckets.get(mapKey) ?? { timestamps: [] };
  const cutoff = now - config.windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    recordTelemetry({
      kind: "rate_limit",
      status: "rate_limited",
      latencyMs: 0,
      errorCategory: config.bucket,
    });
    throw new HttpError(
      429,
      "rate_limited",
      `Rate limit exceeded for ${config.bucket}. Please wait a moment before trying again.`,
    );
  }
  entry.timestamps.push(now);
  rateBuckets.set(mapKey, entry);

  // Prevent unbounded growth across long-lived processes
  if (rateBuckets.size > 2000) {
    const oldestKey = rateBuckets.keys().next().value;
    if (oldestKey) rateBuckets.delete(oldestKey);
  }
}

export async function readBoundedJson<T = unknown>(request: Request, maxBytes = 65_536): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Request exceeds ${maxBytes} byte limit.`);
  }
  const raw = await request.text();
  if (raw.length > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Request exceeds ${maxBytes} byte limit.`);
  }
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Cache-Control": "no-store",
};

export function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function errorResponse(err: unknown, requestId?: string): Response {
  if (err instanceof HttpError) {
    return jsonResponse(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(requestId ? { requestId } : {}),
        },
      },
      err.status,
      err.status === 429 ? { "Retry-After": "30" } : undefined,
    );
  }
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";
  console.error("[API Error]", { requestId, message });
  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "Unable to complete request. Please try again.",
        ...(requestId ? { requestId } : {}),
      },
    },
    500,
  );
}

// ===== Operational Telemetry Ring Buffer (structured logs + admin observability) =====
export interface TelemetryEvent {
  at: string;
  kind: "search" | "chat" | "ui_validation" | "embedding" | "llm" | "rate_limit" | "security";
  status: "ok" | "no_results" | "error" | "rate_limited" | "flagged";
  latencyMs: number;
  query?: string;
  intent?: string;
  resultCount?: number;
  lowConfidence?: boolean;
  tokens?: number;
  estimatedCostUsd?: number;
  uiValidated?: boolean;
  errorCategory?: string;
  model?: string;
}

const telemetryBuffer: TelemetryEvent[] = [];
const MAX_TELEMETRY = 300;

export function recordTelemetry(ev: Omit<TelemetryEvent, "at">): void {
  telemetryBuffer.unshift({ ...ev, at: new Date().toISOString() });
  if (telemetryBuffer.length > MAX_TELEMETRY) {
    telemetryBuffer.length = MAX_TELEMETRY;
  }
}

export function getTelemetryEvents(): TelemetryEvent[] {
  return telemetryBuffer;
}
