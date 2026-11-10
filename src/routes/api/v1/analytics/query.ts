import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { filtersSchema } from "@/lib/events/filters";
import { SEARCH_MODES } from "@/lib/events/types";

const querySchema = z.object({
  query: z.string().max(400).default(""),
  mode: z.enum(SEARCH_MODES).default("hybrid"),
  filters: filtersSchema.partial().optional(),
  eventIds: z.array(z.string().uuid()).max(60).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/v1/analytics/query")({
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
        const { runAuthorizedAggregate } = await import("@/lib/server/analytics.server");

        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.default);
          const parsed = querySchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) {
            throw new HttpError(400, "invalid_request", "Invalid analytics query.");
          }
          const result = await runAuthorizedAggregate({
            query: parsed.data.query,
            mode: parsed.data.mode,
            ...(parsed.data.filters ? { filters: parsed.data.filters } : {}),
            ...(parsed.data.eventIds ? { eventIds: parsed.data.eventIds } : {}),
            workspaceId: parsed.data.workspaceId ?? null,
            dimensions: ["category", "technology", "format", "month"],
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
