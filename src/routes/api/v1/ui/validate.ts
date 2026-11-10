import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/ui/validate")({
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
        const { resolveAuthContext } = await import("@/lib/server/supabase.server");
        const { validateUISpec } = await import("@/lib/ui/validator");

        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.ui);
          const body = await readBoundedJson(request, 200_000);
          const result = validateUISpec(body);
          recordTelemetry({
            kind: "ui_validation",
            status: result.ok ? "ok" : "error",
            latencyMs: 0,
            uiValidated: result.ok,
          });
          return jsonResponse(result, result.ok ? 200 : 422);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
