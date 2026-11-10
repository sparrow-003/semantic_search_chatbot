import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { filtersSchema, sanitizeFilters } from "@/lib/events/filters";

const uiGenerateSchema = z.object({
  query: z.string().min(1).max(2000),
  eventIds: z.array(z.string().uuid()).max(60).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  filters: filtersSchema.partial().optional(),
});

export const Route = createFileRoute("/api/v1/ui/generate")({
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
          recordTelemetry,
        } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, HttpError } = await import("@/lib/server/supabase.server");
        const { executeSearch, fetchEventFacets, fetchEventsByIds } =
          await import("@/lib/server/search.server");
        const { parseUserIntent } = await import("@/lib/ai/intent-parser");
        const { composeUIResponse } = await import("@/lib/ai/ui-composer");
        const { validateUISpec } = await import("@/lib/ui/validator");

        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.ui);
          const body = uiGenerateSchema.safeParse(await readBoundedJson(request));
          if (!body.success) {
            throw new HttpError(
              400,
              "invalid_request",
              body.error.issues[0]?.message ?? "Invalid UI generate request.",
            );
          }

          const parsed = parseUserIntent(body.data.query);
          const ws = body.data.workspaceId ?? null;
          const facets = await fetchEventFacets(ws, auth);
          const events =
            parsed.intent === "generate_diagram" || parsed.intent === "generate_form"
              ? []
              : body.data.eventIds?.length
                ? await fetchEventsByIds(
                    body.data.eventIds,
                    ws,
                    auth,
                    parsed.searchText,
                    parsed.filters,
                  )
                : (
                    await executeSearch({
                      query: parsed.searchText,
                      mode: "hybrid",
                      filters: body.data.filters
                        ? sanitizeFilters({
                            ...parsed.filters,
                            ...sanitizeFilters(body.data.filters),
                          })
                        : parsed.filters,
                      signals: parsed.topics,
                      freeOnly: parsed.isFreeOnly,
                      workspaceId: ws,
                      limit: 40,
                      auth,
                      intent: "ui_generate",
                    })
                  ).results;

          const spec = composeUIResponse({
            query: body.data.query,
            parsed,
            events,
            facets,
          });
          const checked = validateUISpec(spec);
          recordTelemetry({
            kind: "ui_validation",
            status: checked.ok ? "ok" : "error",
            latencyMs: 0,
            uiValidated: checked.ok,
          });
          if (!checked.ok) {
            throw new HttpError(500, "ui_validation_failed", checked.errors.join("; "));
          }
          return jsonResponse({ uiSpec: checked.data, eventCount: events.length });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
