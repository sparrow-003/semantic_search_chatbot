import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CHART_DIMENSIONS } from "@/lib/events/aggregate";
import { filtersSchema, sanitizeFilters } from "@/lib/events/filters";
import { SEARCH_MODES } from "@/lib/events/types";

const aggSchema = z.object({
  query: z.string().max(400).default(""),
  mode: z.enum(SEARCH_MODES).default("hybrid"),
  filters: filtersSchema.partial().optional(),
  eventIds: z.array(z.string().uuid()).max(60).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  dimensions: z.array(z.enum(CHART_DIMENSIONS)).min(1).max(6).default(["category"]),
  top: z.number().int().min(1).max(30).default(12),
});

export const Route = createFileRoute("/api/v1/analytics/aggregate")({
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
          const parsed = aggSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) {
            throw new HttpError(400, "invalid_request", "Invalid aggregate payload.");
          }
          const result = await runAuthorizedAggregate({
            query: parsed.data.query,
            mode: parsed.data.mode,
            ...(parsed.data.filters ? { filters: sanitizeFilters(parsed.data.filters) } : {}),
            ...(parsed.data.eventIds ? { eventIds: parsed.data.eventIds } : {}),
            workspaceId: parsed.data.workspaceId ?? null,
            dimensions: parsed.data.dimensions,
            top: parsed.data.top,
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
