import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/embeddings/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        const { getEmbeddingStatus } = await import("@/lib/server/indexing.server");

        try {
          const auth = await resolveAuthContext(request);
          const url = new URL(request.url);
          const ws = url.searchParams.get("workspaceId");
          if (ws && !isValidUuid(ws)) {
            throw new HttpError(400, "invalid_workspace", "Invalid workspaceId.");
          }
          const status = await getEmbeddingStatus(ws ?? null, auth);
          return jsonResponse(status);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
