import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/analytics/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        const { getObservabilityMetrics } = await import("@/lib/server/analytics.server");
        try {
          const auth = await resolveAuthContext(request);
          const url = new URL(request.url);
          const ws = url.searchParams.get("workspaceId");
          if (ws && !isValidUuid(ws)) {
            throw new HttpError(400, "invalid_workspace", "Invalid workspaceId.");
          }
          const metrics = await getObservabilityMetrics(ws ?? null, auth);
          return jsonResponse(metrics);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

