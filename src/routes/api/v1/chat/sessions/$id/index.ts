import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const patchSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  is_saved: z.boolean().optional(),
});

export const Route = createFileRoute("/api/v1/chat/sessions/$id/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } =
          await import("@/lib/server/supabase.server");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id))
            throw new HttpError(400, "invalid_id", "Invalid session ID.");
          const { data, error } = await auth!.client
            .from("chat_sessions")
            .select("id, title, is_saved, tenant_id, created_at, updated_at")
            .eq("id", params.id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new HttpError(404, "not_found", "Session not found.");
          return jsonResponse({ session: data });
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
            throw new HttpError(400, "invalid_id", "Invalid session ID.");
          const parsed = patchSessionSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success)
            throw new HttpError(400, "invalid_request", "Invalid update payload.");

          const updateData: { title?: string; is_saved?: boolean } = {};
          if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
          if (parsed.data.is_saved !== undefined) updateData.is_saved = parsed.data.is_saved;

          const { data, error } = await auth!.client
            .from("chat_sessions")
            .update(updateData)
            .eq("id", params.id)
            .select("id, title, is_saved, tenant_id, created_at, updated_at")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new HttpError(404, "not_found", "Session not found.");
          return jsonResponse({ session: data });
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
            throw new HttpError(400, "invalid_id", "Invalid session ID.");
          const { error } = await auth!.client.from("chat_sessions").delete().eq("id", params.id);
          if (error) throw new Error(error.message);
          return jsonResponse({ deleted: true });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
