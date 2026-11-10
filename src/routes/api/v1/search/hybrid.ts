import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { filtersSchema } from "@/lib/events/filters";
import { SEARCH_MODES } from "@/lib/events/types";

const searchBodySchema = z.object({
  query: z.string().max(1000).default(""),
  mode: z.enum(SEARCH_MODES).optional(),
  filters: filtersSchema.partial().optional(),
  signals: z.array(z.string().max(60)).max(12).optional(),
  freeOnly: z.boolean().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(60).optional(),
});

export const Route = createFileRoute("/api/v1/search/hybrid")({
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
        const { parseUserIntent } = await import("@/lib/ai/intent-parser");

        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.search);
          const body = searchBodySchema.safeParse(await readBoundedJson(request));
          if (!body.success) {
            throw new HttpError(400, "invalid_request", body.error.issues[0]?.message ?? "Invalid search request.");
          }

          const parsedIntent = body.data.query.trim()
            ? parseUserIntent(body.data.query)
            : null;
          const mergedFilters = {
            formats: body.data.filters?.formats?.length
              ? body.data.filters.formats
              : parsedIntent?.filters.formats ?? [],
            categories: body.data.filters?.categories?.length
              ? body.data.filters.categories
              : parsedIntent?.filters.categories ?? [],
            technologies: body.data.filters?.technologies?.length
              ? body.data.filters.technologies
              : parsedIntent?.filters.technologies ?? [],
            dateStart: body.data.filters?.dateStart ?? parsedIntent?.filters.dateStart ?? null,
            dateEnd: body.data.filters?.dateEnd ?? parsedIntent?.filters.dateEnd ?? null,
            city: body.data.filters?.city ?? parsedIntent?.filters.city ?? null,
          };

          const result = await executeSearch({
            query: body.data.query,
            mode: body.data.mode ?? "hybrid",
            filters: mergedFilters,
            signals: body.data.signals ?? parsedIntent?.topics ?? [],
            freeOnly: body.data.freeOnly ?? parsedIntent?.isFreeOnly ?? false,
            workspaceId: body.data.workspaceId ?? null,
            limit: body.data.limit ?? 30,
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
