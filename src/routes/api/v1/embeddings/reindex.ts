import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const reindexSchema = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  force: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const Route = createFileRoute("/api/v1/embeddings/reindex")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          checkRateLimit,
          errorResponse,
          getClientKey,
          jsonResponse,
          RATE_LIMITS,
          readBoundedJson,
        } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, HttpError } = await import("@/lib/server/supabase.server");
        const { indexEventsBatch } = await import("@/lib/server/indexing.server");

        try {
          const auth = await resolveAuthContext(request, { required: true });
          checkRateLimit(getClientKey(request, auth!.userId), RATE_LIMITS.embeddings);
          const body = reindexSchema.safeParse(await readBoundedJson(request));
          if (!body.success) {
            throw new HttpError(400, "invalid_request", "Invalid reindex payload.");
          }
          const result = await indexEventsBatch({
            workspaceId: body.data.workspaceId ?? null,
            forceReindex: body.data.force ?? true,
            limit: body.data.limit ?? 60,
            auth,
          });
          return jsonResponse(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

