import {
  computeKpis,
  groupCount,
  type ChartDimension,
  type Kpis,
  type SeriesPoint,
} from "@/lib/events/aggregate";
import type { SearchFilters, SearchMode } from "@/lib/events/types";
import { getTelemetryEvents } from "./rate-limit.server";
import { executeSearch, fetchEventsByIds } from "./search.server";
import {
  getAdminSupabaseClientOptional,
  isPlatformAdmin,
  type AuthContext,
} from "./supabase.server";
import { getEmbeddingStatus } from "./indexing.server";

export interface AnalyticsAggregateInput {
  query?: string;
  mode?: SearchMode;
  filters?: Partial<SearchFilters>;
  eventIds?: string[];
  workspaceId?: string | null;
  dimensions: ChartDimension[];
  top?: number;
  auth: AuthContext | null;
}

export interface AnalyticsAggregateOutput {
  kpis: Kpis;
  totalEvents: number;
  series: Record<string, SeriesPoint[]>;
  refreshedAt: string;
  provenance: string;
}

/**
 * Authorized analytics aggregation service. Computes all KPIs and distributions
 * deterministically from scoped database records — never executes model SQL.
 */
export async function runAuthorizedAggregate(
  input: AnalyticsAggregateInput,
): Promise<AnalyticsAggregateOutput> {
  const events = input.eventIds?.length
    ? await fetchEventsByIds(input.eventIds, input.workspaceId ?? null, input.auth)
    : (
        await executeSearch({
          query: input.query ?? "",
          mode: input.mode ?? "hybrid",
          ...(input.filters ? { filters: input.filters } : {}),
          workspaceId: input.workspaceId ?? null,
          limit: 60,
          auth: input.auth,
          intent: "analytics_aggregate",
        })
      ).results;

  const kpis = computeKpis(events);
  const series: Record<string, SeriesPoint[]> = {};
  for (const dim of input.dimensions) {
    series[dim] = groupCount(events, dim, input.top ?? 12);
  }

  return {
    kpis,
    totalEvents: events.length,
    series,
    refreshedAt: new Date().toISOString(),
    provenance: input.eventIds?.length
      ? `Computed over ${events.length} referenced event IDs`
      : `Computed over ${events.length} authorized query results`,
  };
}

export interface ObservabilityMetrics {
  scope: "platform_admin" | "session_telemetry";
  searchRequests: number;
  searchSuccessRate: number;
  noResultRate: number;
  lowConfidenceRate: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  llmCalls: number;
  llmErrors: number;
  embeddingErrors: number;
  totalTokens: number;
  estimatedCostUsd: number;
  uiValidations: number;
  uiValidationSuccessRate: number;
  rateLimitedCount: number;
  securityFlaggedCount: number;
  topTechnologies: Array<{ label: string; count: number }>;
  recentFeedback: Array<{
    rating: string;
    query: string | null;
    comment: string | null;
    createdAt: string;
  }>;
  embeddingStatus: Awaited<ReturnType<typeof getEmbeddingStatus>>;
}

function percentile95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx] ?? 0;
}

export async function getObservabilityMetrics(
  workspaceId: string | null,
  auth: AuthContext | null,
): Promise<ObservabilityMetrics> {
  const embeddingStatus = await getEmbeddingStatus(workspaceId, auth);
  const admin = await getAdminSupabaseClientOptional();
  const isAdminUser = auth ? await isPlatformAdmin(auth.client, auth.userId) : false;

  const mem = getTelemetryEvents();
  const memSearches = mem.filter((e) => e.kind === "search");
  const memLlm = mem.filter((e) => e.kind === "llm");
  const memEmb = mem.filter((e) => e.kind === "embedding");
  const memUi = mem.filter((e) => e.kind === "ui_validation");

  let searchRequests = memSearches.length;
  let successCount = memSearches.filter((s) => s.status === "ok").length;
  let noResultCount = memSearches.filter((s) => s.status === "no_results").length;
  let lowConfCount = memSearches.filter((s) => s.lowConfidence).length;
  let latencies = memSearches.map((s) => s.latencyMs);
  let recentFeedback: ObservabilityMetrics["recentFeedback"] = [];

  if (admin && isAdminUser) {
    const [{ data: qRows }, { data: fbRows }] = await Promise.all([
      admin
        .from("search_queries")
        .select("status, low_confidence, latency_ms")
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("feedback")
        .select("rating, query, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (qRows?.length) {
      searchRequests = qRows.length;
      successCount = qRows.filter((r) => r.status === "ok").length;
      noResultCount = qRows.filter((r) => r.status === "no_results").length;
      lowConfCount = qRows.filter((r) => r.low_confidence).length;
      latencies = qRows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
    }
    if (fbRows) {
      recentFeedback = fbRows.map((f) => ({
        rating: f.rating,
        query: f.query,
        comment: f.comment,
        createdAt: f.created_at,
      }));
    }
  }

  const totalTokens = [...memLlm, ...memEmb].reduce((acc, e) => acc + (e.tokens ?? 0), 0);
  const estimatedCostUsd = Number(
    [...memLlm, ...memEmb].reduce((acc, e) => acc + (e.estimatedCostUsd ?? 0), 0).toFixed(4),
  );
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  // Compute top technologies across catalog so admin panel always has useful distribution
  const catalog = await executeSearch({
    query: "",
    mode: "keyword",
    workspaceId,
    limit: 60,
    auth,
    intent: "metrics_catalog",
  });
  const techCounts = groupCount(catalog.results, "technology", 8).map((p) => ({
    label: p.label,
    count: p.value,
  }));

  return {
    scope: isAdminUser ? "platform_admin" : "session_telemetry",
    searchRequests,
    searchSuccessRate: searchRequests ? Math.round((successCount / searchRequests) * 100) : 100,
    noResultRate: searchRequests ? Math.round((noResultCount / searchRequests) * 100) : 0,
    lowConfidenceRate: searchRequests ? Math.round((lowConfCount / searchRequests) * 100) : 0,
    p95LatencyMs: percentile95(latencies),
    avgLatencyMs,
    llmCalls: memLlm.length,
    llmErrors: memLlm.filter((e) => e.status === "error").length,
    embeddingErrors: memEmb.filter((e) => e.status === "error").length,
    totalTokens,
    estimatedCostUsd,
    uiValidations: memUi.length,
    uiValidationSuccessRate: memUi.length
      ? Math.round((memUi.filter((u) => u.uiValidated).length / memUi.length) * 100)
      : 100,
    rateLimitedCount: mem.filter((e) => e.status === "rate_limited").length,
    securityFlaggedCount: mem.filter((e) => e.kind === "security").length,
    topTechnologies: techCounts,
    recentFeedback,
    embeddingStatus,
  };
}
