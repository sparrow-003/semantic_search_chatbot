import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const Route = createFileRoute("/api/v1/workspaces/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext } = await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          const [{ data: tenants, error: tErr }, { data: memberships, error: mErr }] =
            await Promise.all([
              auth!.client
                .from("tenants")
                .select("id, name, created_by, created_at, updated_at")
                .order("created_at", { ascending: true }),
              auth!.client
                .from("tenant_members")
                .select("tenant_id, role")
                .eq("user_id", auth!.userId),
            ]);
          if (tErr) throw new Error(tErr.message);
          if (mErr) throw new Error(mErr.message);

          const roleMap = new Map((memberships ?? []).map((m) => [m.tenant_id, m.role]));
          const workspaces = (tenants ?? []).map((t) => ({
            ...t,
            role: roleMap.get(t.id) ?? "member",
          }));
          return jsonResponse({ workspaces });
        } catch (err) {
          return errorResponse(err);
        }
      },

      POST: async ({ request }) => {
        const { errorResponse, jsonResponse, readBoundedJson } = await import(
          "@/lib/server/rate-limit.server"
        );
        const { resolveAuthContext, HttpError } = await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          const parsed = createWorkspaceSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) throw new HttpError(400, "invalid_request", "Workspace name must be 1–80 chars.");

          const { data, error } = await auth!.client
            .from("tenants")
            .insert({ name: parsed.data.name, created_by: auth!.userId })
            .select("id, name, created_by, created_at, updated_at")
            .single();
          if (error) throw new Error(error.message);
          return jsonResponse({ workspace: { ...data, role: "owner" } }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
