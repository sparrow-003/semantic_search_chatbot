import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const patchArtifactSchema = z.object({
  uiSpec: z.unknown(),
});

export const Route = createFileRoute("/api/v1/ui/artifacts/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id)) {
            throw new HttpError(400, "invalid_id", "Artifact ID must be a valid message UUID.");
          }
          const { data, error } = await auth!.client
            .from("chat_messages")
            .select("id, session_id, parts, context, created_at")
            .eq("id", params.id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new HttpError(404, "not_found", "UI artifact not found.");
          return jsonResponse({ artifact: data });
        } catch (err) {
          return errorResponse(err);
        }
      },

      PATCH: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } = await import(
          "@/lib/server/rate-limit.server"
        );
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        const { validateUISpec } = await import("@/lib/ui/validator");
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id)) {
            throw new HttpError(400, "invalid_id", "Artifact ID must be a valid message UUID.");
          }
          const body = patchArtifactSchema.safeParse(await readBoundedJson(request, 200_000));
          if (!body.success) throw new HttpError(400, "invalid_request", "Invalid artifact payload.");

          const validated = validateUISpec(body.data.uiSpec);
          if (!validated.ok) {
            throw new HttpError(422, "invalid_ui_spec", validated.errors.join("; "));
          }

          const { data: existing, error: fetchErr } = await auth!.client
            .from("chat_messages")
            .select("id, parts")
            .eq("id", params.id)
            .maybeSingle();
          if (fetchErr) throw new Error(fetchErr.message);
          if (!existing) throw new HttpError(404, "not_found", "UI artifact not found.");

          const prevParts = Array.isArray(existing.parts) ? existing.parts : [];
          const nextParts = [
            ...prevParts.filter(
              (p) => !(p && typeof p === "object" && "type" in p && p.type === "ui_response"),
            ),
            { type: "ui_response", spec: validated.data },
          ];

          const { data: updated, error: updErr } = await auth!.client
            .from("chat_messages")
            .update({ parts: JSON.parse(JSON.stringify(nextParts)) })
            .eq("id", params.id)
            .select("id, parts, context, created_at")
            .single();
          if (updErr) throw new Error(updErr.message);
          return jsonResponse({ artifact: updated });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
