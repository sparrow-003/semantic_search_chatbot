import { embeddingDocument } from "@/lib/events/ranking";
import type { EventFormat, EventRecord } from "@/lib/events/types";
import {
  EMBEDDING_MODEL,
  isGatewayConfigured,
  lovableEmbeddingProvider,
} from "./providers.server";
import {
  assertWorkspaceAccess,
  createAnonSupabaseClient,
  getAdminSupabaseClientOptional,
  HttpError,
  isPlatformAdmin,
  type AuthContext,
} from "./supabase.server";
import { recordTelemetry } from "./rate-limit.server";

export interface EmbeddingStatusSummary {
  total: number;
  indexed: number;
  pending: number;
  failed: number;
  vectorRows: number;
  embeddingModel: string;
  providerConfigured: boolean;
  adminWritesConfigured: boolean;
}

export async function computeContentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getEmbeddingStatus(
  workspaceId: string | null,
  auth: AuthContext | null,
): Promise<EmbeddingStatusSummary> {
  const admin = await getAdminSupabaseClientOptional();
  if (workspaceId && auth) {
    await assertWorkspaceAccess(auth.client, auth.userId, workspaceId);
  } else if (workspaceId && !auth) {
    throw new HttpError(401, "unauthorized", "Authentication required to inspect workspace index status.");
  }

  const client = admin ?? auth?.client ?? createAnonSupabaseClient();
  let query = client.from("events").select("id, index_status");
  if (workspaceId) {
    query = query.or(`tenant_id.is.null,tenant_id.eq.${workspaceId}`);
  } else {
    query = query.is("tenant_id", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    throw new HttpError(500, "db_error", `Unable to load event index status: ${error.message}`);
  }

  const list = rows ?? [];
  const indexed = list.filter((r) => r.index_status === "indexed").length;
  const failed = list.filter((r) => r.index_status === "failed").length;
  const pending = list.filter((r) => r.index_status === "pending").length;

  let vectorRows = indexed;
  if (admin) {
    const { count } = await admin
      .from("event_embeddings")
      .select("event_id", { count: "exact", head: true });
    if (typeof count === "number") vectorRows = count;
  }

  return {
    total: list.length,
    indexed,
    pending,
    failed,
    vectorRows,
    embeddingModel: EMBEDDING_MODEL,
    providerConfigured: isGatewayConfigured(),
    adminWritesConfigured: Boolean(admin),
  };
}

export interface IndexBatchOptions {
  workspaceId?: string | null;
  eventIds?: string[];
  forceReindex?: boolean;
  limit?: number;
  auth: AuthContext | null;
  allowOpportunistic?: boolean;
}

export interface IndexBatchResult {
  processed: number;
  indexed: number;
  skippedUnchanged: number;
  failed: number;
  model: string;
  errors: Array<{ eventId: string; error: string }>;
}

export async function indexEventsBatch(opts: IndexBatchOptions): Promise<IndexBatchResult> {
  const admin = await getAdminSupabaseClientOptional();
  if (!admin) {
    throw new HttpError(
      503,
      "service_unavailable",
      "SUPABASE_SERVICE_ROLE_KEY is required on the server to write vector embeddings.",
    );
  }
  if (!lovableEmbeddingProvider.isAvailable()) {
    throw new HttpError(
      503,
      "provider_unavailable",
      "LOVABLE_API_KEY is not configured for embedding generation.",
    );
  }

  if (!opts.allowOpportunistic) {
    if (!opts.auth) {
      throw new HttpError(401, "unauthorized", "Authentication required to generate embeddings.");
    }
    if (opts.workspaceId) {
      await assertWorkspaceAccess(opts.auth.client, opts.auth.userId, opts.workspaceId, "editor");
    } else {
      const isAdmin = await isPlatformAdmin(opts.auth.client, opts.auth.userId);
      if (!isAdmin) {
        throw new HttpError(403, "forbidden", "Requires editor workspace role or platform_admin.");
      }
    }
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  let evQuery = admin
    .from("events")
    .select(
      "id, tenant_id, title, summary, description, category, format, start_at, end_at, venue, city, country, registration_url, technologies, audience, is_free, index_status",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (opts.eventIds?.length) {
    evQuery = evQuery.in("id", opts.eventIds.slice(0, 100));
  } else if (!opts.forceReindex) {
    evQuery = evQuery.neq("index_status", "indexed");
  }

  if (opts.workspaceId) {
    evQuery = evQuery.eq("tenant_id", opts.workspaceId);
  } else if (opts.allowOpportunistic) {
    evQuery = evQuery.is("tenant_id", null);
  }

  const { data: events, error: fetchErr } = await evQuery;
  if (fetchErr) {
    throw new HttpError(500, "db_error", `Failed to fetch events for indexing: ${fetchErr.message}`);
  }
  if (!events?.length) {
    return {
      processed: 0,
      indexed: 0,
      skippedUnchanged: 0,
      failed: 0,
      model: EMBEDDING_MODEL,
      errors: [],
    };
  }

  const ids = events.map((e) => e.id);
  const { data: existingEmbeddings } = await admin
    .from("event_embeddings")
    .select("event_id, content_hash, embedding_model")
    .in("event_id", ids);
  const existingMap = new Map(
    (existingEmbeddings ?? []).map((row) => [row.event_id, row]),
  );

  const toEmbed: Array<{ event: EventRecord; doc: string; hash: string }> = [];
  let skippedUnchanged = 0;

  for (const row of events) {
    const rec: EventRecord = {
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
      isFree: row.is_free,
    };
    const doc = embeddingDocument(rec);
    const hash = await computeContentHash(doc);
    const prev = existingMap.get(rec.id);
    if (
      !opts.forceReindex &&
      prev &&
      prev.content_hash === hash &&
      prev.embedding_model === EMBEDDING_MODEL &&
      row.index_status === "indexed"
    ) {
      skippedUnchanged++;
      continue;
    }
    toEmbed.push({ event: rec, doc, hash });
  }

  let indexed = 0;
  let failed = 0;
  const errors: Array<{ eventId: string; error: string }> = [];

  // Process in batches of 16 to avoid oversized gateway payloads
  for (let i = 0; i < toEmbed.length; i += 16) {
    const chunk = toEmbed.slice(i, i + 16);
    try {
      const vectors = await lovableEmbeddingProvider.generateEmbeddingsBatch(
        chunk.map((item) => item.doc),
      );
      const now = new Date().toISOString();
      const upserts = chunk.map((item, idx) => ({
        event_id: item.event.id,
        embedding: JSON.stringify(vectors[idx]),
        embedding_model: EMBEDDING_MODEL,
        content_hash: item.hash,
        indexed_at: now,
      }));
      const { error: upsertErr } = await admin
        .from("event_embeddings")
        .upsert(upserts, { onConflict: "event_id" });
      if (upsertErr) throw new Error(upsertErr.message);

      await admin
        .from("events")
        .update({ index_status: "indexed", index_error: null })
        .in(
          "id",
          chunk.map((c) => c.event.id),
        );
      indexed += chunk.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Embedding batch failed";
      failed += chunk.length;
      for (const item of chunk) {
        errors.push({ eventId: item.event.id, error: msg });
      }
      await admin
        .from("events")
        .update({ index_status: "failed", index_error: msg.slice(0, 300) })
        .in(
          "id",
          chunk.map((c) => c.event.id),
        );
      recordTelemetry({
        kind: "embedding",
        status: "error",
        latencyMs: 0,
        errorCategory: "batch_failed",
      });
    }
  }

  return {
    processed: events.length,
    indexed,
    skippedUnchanged,
    failed,
    model: EMBEDDING_MODEL,
    errors,
  };
}
