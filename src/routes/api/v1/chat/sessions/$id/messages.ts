import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/chat/sessions/$id/messages")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id)) throw new HttpError(400, "invalid_id", "Invalid session ID.");
          const { data, error } = await auth!.client
            .from("chat_messages")
            .select("id, role, content, parts, context, created_at")
            .eq("session_id", params.id)
            .order("created_at", { ascending: true });
          if (error) throw new Error(error.message);
          return jsonResponse({ messages: data ?? [] });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

