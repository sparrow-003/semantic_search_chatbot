import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { dashboardConfigSchema } from "@/lib/ui/schema";

const createDashboardSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  visibility: z.enum(["private", "workspace"]).default("private"),
  configuration: dashboardConfigSchema,
});

export const Route = createFileRoute("/api/v1/dashboards/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, isValidUuid, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          const url = new URL(request.url);
          const ws = url.searchParams.get("workspaceId");
          if (ws) {
            if (!isValidUuid(ws))
              throw new HttpError(400, "invalid_workspace", "Invalid workspaceId.");
            await assertWorkspaceAccess(auth!.client, auth!.userId, ws);
          }

          let query = auth!.client
            .from("saved_dashboards")
            .select(
              "id, tenant_id, owner_id, name, visibility, configuration, created_at, updated_at",
            )
            .order("updated_at", { ascending: false })
            .limit(50);

          if (ws) query = query.eq("tenant_id", ws);
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          return jsonResponse({ dashboards: data ?? [] });
        } catch (err) {
          return errorResponse(err);
        }
      },

      POST: async ({ request }) => {
        const {
          errorResponse,
          jsonResponse,
          readBoundedJson,
          checkRateLimit,
          getClientKey,
          RATE_LIMITS,
        } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          checkRateLimit(getClientKey(request, auth!.userId), RATE_LIMITS.default);
          const parsed = createDashboardSchema.safeParse(await readBoundedJson(request, 120_000));
          if (!parsed.success) {
            throw new HttpError(
              400,
              "invalid_request",
              parsed.error.issues[0]?.message ?? "Invalid dashboard payload.",
            );
          }
          await assertWorkspaceAccess(
            auth!.client,
            auth!.userId,
            parsed.data.workspaceId,
            "member",
          );

          const { data, error } = await auth!.client
            .from("saved_dashboards")
            .insert({
              tenant_id: parsed.data.workspaceId,
              owner_id: auth!.userId,
              name: parsed.data.name,
              visibility: parsed.data.visibility,
              configuration: JSON.parse(JSON.stringify(parsed.data.configuration)),
            })
            .select(
              "id, tenant_id, owner_id, name, visibility, configuration, created_at, updated_at",
            )
            .single();
          if (error) throw new Error(error.message);
          return jsonResponse({ dashboard: data }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
