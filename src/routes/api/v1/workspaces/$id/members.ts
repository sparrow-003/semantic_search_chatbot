import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const addMemberSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "editor", "member", "viewer"]).default("member"),
});

const patchMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "member", "viewer"]),
});

const removeMemberSchema = z.object({
  userId: z.string().uuid(),
});

export const Route = createFileRoute("/api/v1/workspaces/$id/members")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          await assertWorkspaceAccess(auth!.client, auth!.userId, params.id);

          const { data: members, error } = await auth!.client
            .from("tenant_members")
            .select("id, tenant_id, user_id, role, created_at")
            .eq("tenant_id", params.id)
            .order("created_at", { ascending: true });
          if (error) throw new HttpError(500, "db_error", error.message);

          const userIds = (members ?? []).map((m) => m.user_id);
          const { data: profiles } = userIds.length
            ? await auth!.client
                .from("profiles")
                .select("id, display_name, avatar_url")
                .in("id", userIds)
            : { data: [] };
          const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));

          return jsonResponse({
            members: (members ?? []).map((m) => ({
              ...m,
              display_name: profMap.get(m.user_id)?.display_name || "Workspace Member",
              avatar_url: profMap.get(m.user_id)?.avatar_url ?? null,
            })),
          });
        } catch (err) {
          return errorResponse(err);
        }
      },

      POST: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } =
          await import("@/lib/server/rate-limit.server");
        const {
          resolveAuthContext,
          assertWorkspaceAccess,
          getAdminSupabaseClientOptional,
          HttpError,
        } = await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          await assertWorkspaceAccess(auth!.client, auth!.userId, params.id, "admin");
          const parsed = addMemberSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success || (!parsed.data.userId && !parsed.data.email)) {
            throw new HttpError(400, "invalid_request", "Provide a valid user ID or email.");
          }

          let targetUserId = parsed.data.userId;
          if (!targetUserId && parsed.data.email) {
            const admin = await getAdminSupabaseClientOptional();
            if (!admin) {
              throw new HttpError(
                400,
                "email_lookup_unavailable",
                "Email lookup requires server admin credentials; supply the member's User UUID directly.",
              );
            }
            const { data: userList, error: listErr } = await admin.auth.admin.listUsers({
              page: 1,
              perPage: 200,
            });
            if (listErr) throw new Error(listErr.message);
            const matched = userList.users.find(
              (u) => u.email?.toLowerCase() === parsed.data.email!.toLowerCase(),
            );
            if (!matched) {
              throw new HttpError(404, "user_not_found", "No registered user matches that email.");
            }
            targetUserId = matched.id;
          }

          const { data, error } = await auth!.client
            .from("tenant_members")
            .insert({
              tenant_id: params.id,
              user_id: targetUserId!,
              role: parsed.data.role,
            })
            .select("id, tenant_id, user_id, role, created_at")
            .single();
          if (error) throw new HttpError(400, "member_add_failed", error.message);
          return jsonResponse({ member: data }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },

      PATCH: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } =
          await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          await assertWorkspaceAccess(auth!.client, auth!.userId, params.id, "admin");
          const parsed = patchMemberSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) throw new HttpError(400, "invalid_request", "Invalid role update.");

          const { data, error } = await auth!.client
            .from("tenant_members")
            .update({ role: parsed.data.role })
            .eq("tenant_id", params.id)
            .eq("user_id", parsed.data.userId)
            .select("id, tenant_id, user_id, role")
            .maybeSingle();
          if (error) throw new HttpError(400, "role_update_failed", error.message);
          if (!data) throw new HttpError(404, "not_found", "Member not found.");
          return jsonResponse({ member: data });
        } catch (err) {
          return errorResponse(err);
        }
      },

      DELETE: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } =
          await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          await assertWorkspaceAccess(auth!.client, auth!.userId, params.id);
          const parsed = removeMemberSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) throw new HttpError(400, "invalid_request", "Invalid userId.");

          const { error } = await auth!.client
            .from("tenant_members")
            .delete()
            .eq("tenant_id", params.id)
            .eq("user_id", parsed.data.userId);
          if (error) throw new HttpError(403, "remove_failed", error.message);
          return jsonResponse({ removed: true });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
