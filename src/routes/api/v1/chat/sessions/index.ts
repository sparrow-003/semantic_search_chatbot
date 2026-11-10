import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/v1/chat/sessions/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse, checkRateLimit, getClientKey, RATE_LIMITS } =
          await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext } = await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          checkRateLimit(getClientKey(request, auth!.userId), RATE_LIMITS.default);

          const url = new URL(request.url);
          const q = url.searchParams.get("q")?.trim();
          const savedOnly = url.searchParams.get("saved") === "true";

          let query = auth!.client
            .from("chat_sessions")
            .select("id, title, is_saved, tenant_id, created_at, updated_at")
            .order("updated_at", { ascending: false })
            .limit(50);

          if (savedOnly) query = query.eq("is_saved", true);
          if (q) query = query.ilike("title", `%${q}%`);

          const { data, error } = await query;
          if (error) throw new Error(error.message);
          return jsonResponse({ sessions: data ?? [] });
        } catch (err) {
          return errorResponse(err);
        }
      },

      POST: async ({ request }) => {
        const {
          errorResponse,
          jsonResponse,
          checkRateLimit,
          getClientKey,
          RATE_LIMITS,
          readBoundedJson,
        } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, assertWorkspaceAccess, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request, { required: true });
          checkRateLimit(getClientKey(request, auth!.userId), RATE_LIMITS.default);
          const body = createSessionSchema.safeParse(await readBoundedJson(request));
          if (!body.success) {
            throw new HttpError(400, "invalid_request", "Invalid session payload.");
          }
          if (body.data.workspaceId) {
            await assertWorkspaceAccess(auth!.client, auth!.userId, body.data.workspaceId);
          }

          const { data, error } = await auth!.client
            .from("chat_sessions")
            .insert({
              user_id: auth!.userId,
              tenant_id: body.data.workspaceId ?? null,
              title: body.data.title ?? "New conversation",
            })
            .select("id, title, is_saved, tenant_id, created_at, updated_at")
            .single();

          if (error) throw new Error(error.message);
          return jsonResponse({ session: data }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
