import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/search/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse, getTelemetryEvents } = await import(
          "@/lib/server/rate-limit.server"
        );
        const { resolveAuthContext, getAdminSupabaseClientOptional } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request);
          const admin = await getAdminSupabaseClientOptional();
          if (auth && admin) {
            const { data } = await admin
              .from("search_queries")
              .select("id, query, intent, filters, result_count, low_confidence, latency_ms, status, created_at")
              .eq("user_id", auth.userId)
              .order("created_at", { ascending: false })
              .limit(30);
            if (data) return jsonResponse({ history: data });
          }

          const recent = getTelemetryEvents()
            .filter((e) => e.kind === "search" && e.query)
            .slice(0, 20)
            .map((e, idx) => ({
              id: `mem-${idx}`,
              query: e.query ?? "",
              intent: e.intent ?? "hybrid",
              result_count: e.resultCount ?? 0,
              low_confidence: Boolean(e.lowConfidence),
              latency_ms: e.latencyMs,
              status: e.status,
              created_at: e.at,
            }));
          return jsonResponse({ history: recent });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

