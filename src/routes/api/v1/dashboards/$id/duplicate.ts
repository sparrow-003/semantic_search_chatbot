import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/dashboards/$id/duplicate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id))
            throw new HttpError(400, "invalid_id", "Invalid dashboard ID.");

          const { data: src, error: fetchErr } = await auth!.client
            .from("saved_dashboards")
            .select("id, tenant_id, name, configuration")
            .eq("id", params.id)
            .maybeSingle();
          if (fetchErr) throw new Error(fetchErr.message);
          if (!src) throw new HttpError(404, "not_found", "Dashboard not found.");

          const { data: copy, error: insErr } = await auth!.client
            .from("saved_dashboards")
            .insert({
              tenant_id: src.tenant_id,
              owner_id: auth!.userId,
              name: `${src.name.slice(0, 108)} (Copy)`,
              visibility: "private",
              configuration: src.configuration,
            })
            .select(
              "id, tenant_id, owner_id, name, visibility, configuration, created_at, updated_at",
            )
            .single();
          if (insErr) throw new Error(insErr.message);
          return jsonResponse({ dashboard: copy }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
