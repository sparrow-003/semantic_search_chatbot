import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/workspaces/$id/audit")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request, { required: true });
          await assertWorkspaceAccess(auth!.client, auth!.userId, params.id, "admin");
          const { data, error } = await auth!.client
            .from("audit_logs")
            .select("id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at")
            .eq("tenant_id", params.id)
            .order("created_at", { ascending: false })
            .limit(80);
          if (error) throw new HttpError(500, "db_error", error.message);
          return jsonResponse({ logs: data ?? [] });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
