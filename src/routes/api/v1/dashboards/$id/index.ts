import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { dashboardConfigSchema } from "@/lib/ui/schema";

const patchDashboardSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  visibility: z.enum(["private", "workspace"]).optional(),
  configuration: dashboardConfigSchema.optional(),
});

export const Route = createFileRoute("/api/v1/dashboards/$id/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id))
            throw new HttpError(400, "invalid_id", "Invalid dashboard ID.");
          const { data, error } = await auth!.client
            .from("saved_dashboards")
            .select(
              "id, tenant_id, owner_id, name, visibility, configuration, created_at, updated_at",
            )
            .eq("id", params.id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new HttpError(404, "not_found", "Dashboard not found.");
          return jsonResponse({ dashboard: data });
        } catch (err) {
          return errorResponse(err);
        }
      },

      PATCH: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } =
          await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id))
            throw new HttpError(400, "invalid_id", "Invalid dashboard ID.");
          const parsed = patchDashboardSchema.safeParse(await readBoundedJson(request, 120_000));
          if (!parsed.success)
            throw new HttpError(400, "invalid_request", "Invalid dashboard update.");

          const upd: TablesUpdate<"saved_dashboards"> = {};
          if (parsed.data.name !== undefined) upd.name = parsed.data.name;
          if (parsed.data.visibility !== undefined) upd.visibility = parsed.data.visibility;
          if (parsed.data.configuration !== undefined) {
            upd.configuration = JSON.parse(JSON.stringify(parsed.data.configuration));
          }

          const { data, error } = await auth!.client
            .from("saved_dashboards")
            .update(upd)
            .eq("id", params.id)
            .select(
              "id, tenant_id, owner_id, name, visibility, configuration, created_at, updated_at",
            )
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new HttpError(404, "not_found", "Dashboard not found or access denied.");
          return jsonResponse({ dashboard: data });
        } catch (err) {
          return errorResponse(err);
        }
      },

      DELETE: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id))
            throw new HttpError(400, "invalid_id", "Invalid dashboard ID.");
          const { error } = await auth!.client
            .from("saved_dashboards")
            .delete()
            .eq("id", params.id);
          if (error) throw new Error(error.message);
          return jsonResponse({ deleted: true });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
