import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { filtersSchema, sanitizeFilters } from "@/lib/events/filters";

const semanticBodySchema = z.object({
  query: z.string().min(1).max(1000),
  filters: filtersSchema.partial().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(60).optional(),
});

export const Route = createFileRoute("/api/v1/search/semantic")({
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
        const { executeSearch } = await import("@/lib/server/search.server");

        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.search);
          const body = semanticBodySchema.safeParse(await readBoundedJson(request));
          if (!body.success) {
            throw new HttpError(400, "invalid_request", body.error.issues[0]?.message ?? "Invalid semantic search request.");
          }
          const result = await executeSearch({
            query: body.data.query,
            mode: "semantic",
            ...(body.data.filters ? { filters: sanitizeFilters(body.data.filters) } : {}),
            workspaceId: body.data.workspaceId ?? null,
            limit: body.data.limit ?? 24,
            auth,
            clientKey: getClientKey(request, auth?.userId),
          });
          return jsonResponse(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
