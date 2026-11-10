import {
  eventMatchesFilters,
  filterBounds,
  hasAnyFilter,
  sanitizeFilters,
} from "@/lib/events/filters";
import { buildTsQuery, rankCandidates, tokenize, type Candidate } from "@/lib/events/ranking";
import type {
  EventFormat,
  EventRecord,
  Facets,
  RankedEvent,
  SearchFilters,
  SearchMode,
  SearchResponse,
} from "@/lib/events/types";
import { indexEventsBatch } from "./indexing.server";
import { isGatewayConfigured, lovableEmbeddingProvider } from "./providers.server";
import { recordTelemetry } from "./rate-limit.server";
import {
  assertWorkspaceAccess,
  createAnonSupabaseClient,
  getAdminSupabaseClientOptional,
  getSupabasePublicConfig,
  HttpError,
  isMissingSchemaError,
  isValidUuid,
  missingSchemaError,
  type AuthContext,
} from "./supabase.server";

const CONSTRAINT_ONLY_TOKENS = new Set([
  "online",
  "virtual",
  "remote",
  "in-person",
  "person",
  "hybrid",
  "free",
  "january",
  "jan",
  "february",
  "feb",
  "march",
  "mar",
  "april",
  "apr",
  "may",
  "june",
  "jun",
  "july",
  "jul",
  "august",
  "aug",
  "september",
  "sep",
  "sept",
  "october",
  "oct",
  "november",
  "nov",
  "december",
  "dec",
  "conference",
  "conferences",
  "workshop",
  "workshops",
  "meetup",
  "meetups",
  "webinar",
  "webinars",
  "hackathon",
  "hackathons",
  "bootcamp",
  "bootcamps",
]);

/** Strip constraint words already enforced via strict filters so browse/filtered queries don't miss valid rows. */
export function stripFilterTokensFromQuery(queryText: string, filters: SearchFilters): string {
  const tokens = tokenize(queryText);
  const cityLower = filters.city?.toLowerCase();
  const catLowers = new Set(filters.categories.map((c) => c.toLowerCase()));
  const filtered = tokens.filter((t) => {
    if (CONSTRAINT_ONLY_TOKENS.has(t)) return false;
    if (cityLower && t === cityLower) return false;
    if (catLowers.has(t)) return false;
    return true;
  });
  return filtered.join(" ");
}

function mapRpcRowToCandidate(row: {
  id: string;
  tenant_id: string | null;
  title: string;
  summary: string;
  description: string;
  category: string;
  format: string;
  start_at: string;
  end_at: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  registration_url: string | null;
  technologies: string[];
  audience: string[];
  is_free: boolean;
  semantic_score?: number;
  keyword_score?: number;
}): Candidate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    format: row.format as EventFormat,
    startAt: row.start_at,
    endAt: row.end_at,
    venue: row.venue,
    city: row.city,
    country: row.country,
    registrationUrl: row.registration_url,
    technologies: row.technologies ?? [],
    audience: row.audience ?? [],
    isFree: Boolean(row.is_free),
    semanticRaw: Number(row.semantic_score ?? 0),
    keywordRaw: Number(row.keyword_score ?? 0),
  };
}

export interface ExecuteSearchInput {
  query: string;
  mode?: SearchMode;
  filters?: Partial<SearchFilters>;
  signals?: string[];
  freeOnly?: boolean;
  workspaceId?: string | null;
  limit?: number;
  auth: AuthContext | null;
  clientKey?: string;
  sessionId?: string | null;
  intent?: string;
}

export async function executeSearch(input: ExecuteSearchInput): Promise<SearchResponse> {
  const started = Date.now();
  const mode: SearchMode = input.mode ?? "hybrid";
  const filters = sanitizeFilters(input.filters);
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
  const workspaceId = input.workspaceId ?? null;

  if (workspaceId) {
    if (!input.auth) {
      throw new HttpError(401, "unauthorized", "Sign in to search private workspace events.");
    }
    await assertWorkspaceAccess(input.auth.client, input.auth.userId, workspaceId);
  }

  const client = input.auth?.client ?? createAnonSupabaseClient();
  const admin = await getAdminSupabaseClientOptional();

  const effectiveText = stripFilterTokensFromQuery(input.query, filters);
  const queryTokens = tokenize(effectiveText);
  const keywordQuery = mode !== "semantic" ? buildTsQuery(queryTokens) : "";

  // Check if vector embeddings can actually run
  let queryEmbedding: number[] | null = null;
  let semanticAvailable = false;

  if (mode !== "keyword" && (effectiveText.trim().length > 0 || input.signals?.length)) {
    if (isGatewayConfigured() && lovableEmbeddingProvider.isAvailable()) {
      try {
        // Opportunistically index pending public events if admin credentials exist
        if (admin) {
          const { count: pendingCount } = await admin
            .from("events")
            .select("id", { count: "exact", head: true })
            .is("tenant_id", null)
            .neq("index_status", "indexed");
          if (pendingCount && pendingCount > 0) {
            await indexEventsBatch({
              limit: 24,
              auth: input.auth,
              allowOpportunistic: true,
            }).catch(() => undefined);
          }
        }
        const vectorInput = effectiveText.trim() || input.signals?.join(" ") || input.query.trim();
        queryEmbedding = await lovableEmbeddingProvider.generateEmbedding(vectorInput);
        // Check if embeddings actually exist in DB when admin is present
        if (admin) {
          const { count: embCount } = await admin
            .from("event_embeddings")
            .select("event_id", { count: "exact", head: true });
          semanticAvailable = (embCount ?? 0) > 0;
        } else {
          semanticAvailable = true;
        }
      } catch {
        queryEmbedding = null;
        semanticAvailable = false;
      }
    }
  }

  const bounds = filterBounds(filters);
  const { data: rpcRows, error: rpcError } = await client.rpc("search_events", {
    query_embedding: (queryEmbedding ? JSON.stringify(queryEmbedding) : null) as unknown as string,
    keyword_query: (keywordQuery || null) as unknown as string,
    workspace_id: workspaceId as unknown as string,
    filter_formats: (filters.formats.length ? filters.formats : null) as unknown as string[],
    filter_categories: (filters.categories.length
      ? filters.categories
      : null) as unknown as string[],
    filter_technologies: (filters.technologies.length
      ? filters.technologies
      : null) as unknown as string[],
    filter_start: bounds.start as unknown as string,
    filter_end: bounds.end as unknown as string,
    filter_city: filters.city as unknown as string,
    match_count: 60,
  });

  if (rpcError) {
    recordTelemetry({
      kind: "search",
      status: "error",
      latencyMs: Date.now() - started,
      query: input.query.slice(0, 120),
      errorCategory: isMissingSchemaError(rpcError) ? "schema_not_initialized" : "rpc_error",
    });
    if (isMissingSchemaError(rpcError)) {
      throw missingSchemaError(getSupabasePublicConfig().url);
    }
    throw new HttpError(500, "search_failed", `Search failed: ${rpcError.message}`);
  }

  let candidates = (rpcRows ?? []).map(mapRpcRowToCandidate);

  // If semantic scores are all 0 while vectors weren't populated yet, reflect honestly
  if (queryEmbedding && candidates.length > 0 && candidates.every((c) => c.semanticRaw <= 0)) {
    semanticAvailable = false;
  }

  // Strict post-filter validation (including freeOnly)
  candidates = candidates.filter((c) => {
    if (!eventMatchesFilters(c, filters)) return false;
    if (input.freeOnly && !c.isFree) return false;
    return true;
  });

  // Fallback for semantic-only request when semantic embeddings are unavailable:
  // re-run keyword/browse if semantic mode returned 0 due to missing vectors
  const effectiveMode: SearchMode = mode === "semantic" && !semanticAvailable ? "keyword" : mode;

  const signals = Array.from(
    new Set([...(input.signals ?? []), ...filters.technologies, ...filters.categories]),
  );

  const { results, lowConfidence } = rankCandidates({
    candidates,
    queryText: effectiveText,
    signals,
    filters,
    mode: effectiveMode,
    limit,
  });

  // If a filtered search returned 0 strictly because of lexical mismatch while filters matched candidates
  let finalResults = results;
  let finalLowConfidence = lowConfidence;
  if (finalResults.length === 0 && candidates.length > 0 && hasAnyFilter(filters)) {
    const browseRanked = rankCandidates({
      candidates,
      queryText: "",
      signals,
      filters,
      mode: effectiveMode,
      limit,
    });
    finalResults = browseRanked.results;
    finalLowConfidence = true;
  }

  const latencyMs = Date.now() - started;
  const topScore = finalResults[0]?.score ?? null;
  const status = finalResults.length === 0 ? "no_results" : "ok";

  recordTelemetry({
    kind: "search",
    status,
    latencyMs,
    query: input.query.slice(0, 120),
    ...(input.intent ? { intent: input.intent } : {}),
    resultCount: finalResults.length,
    lowConfidence: finalLowConfidence,
  });

  // Persist search telemetry when admin client is available
  if (admin) {
    void admin
      .from("search_queries")
      .insert({
        user_id: input.auth?.userId ?? null,
        tenant_id: workspaceId,
        session_id: isValidUuid(input.sessionId) ? input.sessionId : null,
        client_key: input.clientKey ?? null,
        query: input.query.slice(0, 500),
        intent: input.intent ?? mode,
        filters: JSON.parse(JSON.stringify(filters)),
        result_count: finalResults.length,
        top_score: topScore,
        low_confidence: finalLowConfidence,
        latency_ms: latencyMs,
        status,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return {
    query: input.query,
    mode,
    filters,
    results: finalResults,
    totalCandidates: candidates.length,
    lowConfidence: finalLowConfidence,
    semanticAvailable,
    latencyMs,
  };
}

export async function fetchEventsByIds(
  eventIds: string[],
  workspaceId: string | null,
  auth: AuthContext | null,
  queryText = "",
  filters?: SearchFilters,
): Promise<RankedEvent[]> {
  const validIds = eventIds.filter((id) => isValidUuid(id)).slice(0, 100);
  if (!validIds.length) return [];
  if (workspaceId) {
    if (!auth) {
      throw new HttpError(401, "unauthorized", "Authentication required for workspace records.");
    }
    await assertWorkspaceAccess(auth.client, auth.userId, workspaceId);
  }
  const client = auth?.client ?? createAnonSupabaseClient();
  const { data, error } = await client.rpc("get_events_by_ids", {
    event_ids: validIds,
    workspace_id: workspaceId as unknown as string,
  });
  if (error) {
    throw new HttpError(500, "db_error", `Unable to fetch referenced events: ${error.message}`);
  }
  const f = filters ?? sanitizeFilters({});
  const candidates = (data ?? [])
    .map((row) => mapRpcRowToCandidate(row))
    .filter((c) => eventMatchesFilters(c, f));
  const { results } = rankCandidates({
    candidates,
    queryText,
    signals: [...f.technologies, ...f.categories],
    filters: f,
    mode: "hybrid",
    limit: 60,
  });
  return results;
}

export async function fetchEventFacets(
  workspaceId: string | null,
  auth: AuthContext | null,
): Promise<Facets> {
  if (workspaceId) {
    if (!auth) {
      throw new HttpError(401, "unauthorized", "Sign in to view workspace facets.");
    }
    await assertWorkspaceAccess(auth.client, auth.userId, workspaceId);
  }
  const client = auth?.client ?? createAnonSupabaseClient();
  const { data, error } = await client.rpc("event_facets", {
    workspace_id: workspaceId as unknown as string,
  });
  if (error) {
    if (isMissingSchemaError(error)) {
      throw missingSchemaError(getSupabasePublicConfig().url);
    }
    throw new HttpError(500, "db_error", `Unable to load event facets: ${error.message}`);
  }
  const raw = (data ?? {}) as Partial<Facets>;
  return {
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    cities: Array.isArray(raw.cities) ? raw.cities : [],
    technologies: Array.isArray(raw.technologies) ? raw.technologies : [],
    total: typeof raw.total === "number" ? raw.total : 0,
  };
}

export function dbRowToEventRecord(row: {
  id: string;
  tenant_id: string | null;
  title: string;
  summary: string;
  description: string;
  category: string;
  format: string;
  start_at: string;
  end_at: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  registration_url: string | null;
  technologies: string[];
  audience: string[];
  is_free: boolean;
}): EventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    format: row.format as EventFormat,
    startAt: row.start_at,
    endAt: row.end_at,
    venue: row.venue,
    city: row.city,
    country: row.country,
    registrationUrl: row.registration_url,
    technologies: row.technologies ?? [],
    audience: row.audience ?? [],
    isFree: Boolean(row.is_free),
  };
}
