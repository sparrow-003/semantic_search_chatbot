import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/search/facets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        const { fetchEventFacets } = await import("@/lib/server/search.server");
        try {
          const auth = await resolveAuthContext(request);
          const url = new URL(request.url);
          const ws = url.searchParams.get("workspaceId");
          if (ws && !isValidUuid(ws)) {
            throw new HttpError(400, "invalid_workspace", "Invalid workspaceId.");
          }
          const facets = await fetchEventFacets(ws ?? null, auth);
          return jsonResponse(facets);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
