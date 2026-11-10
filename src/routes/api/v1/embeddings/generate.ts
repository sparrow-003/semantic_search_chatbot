import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const generateSchema = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  eventIds: z.array(z.string().uuid()).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const Route = createFileRoute("/api/v1/embeddings/generate")({
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
          const body = generateSchema.safeParse(await readBoundedJson(request));
          if (!body.success) {
            throw new HttpError(400, "invalid_request", "Invalid embedding generation payload.");
          }
          const result = await indexEventsBatch({
            workspaceId: body.data.workspaceId ?? null,
            ...(body.data.eventIds ? { eventIds: body.data.eventIds } : {}),
            limit: body.data.limit ?? 50,
            forceReindex: false,
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

