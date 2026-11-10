import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { EVENT_FORMATS } from "@/lib/events/types";

const patchEventSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  summary: z.string().trim().max(400).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  format: z.enum(EVENT_FORMATS).optional(),
  startAt: z.string().min(10).max(40).optional(),
  endAt: z.string().max(40).nullable().optional(),
  venue: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  registrationUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/.+/)
    .max(500)
    .nullable()
    .optional(),
  technologies: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  audience: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  isFree: z.boolean().optional(),
  status: z.enum(["draft", "published", "cancelled"]).optional(),
});

export const Route = createFileRoute("/api/v1/events/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } = await import(
          "@/lib/server/rate-limit.server"
        );
        const { resolveAuthContext, isValidUuid, hasAdminCredentials, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        const { indexEventsBatch } = await import("@/lib/server/indexing.server");

        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id)) throw new HttpError(400, "invalid_id", "Invalid event ID.");
          const parsed = patchEventSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) {
            throw new HttpError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid event update.");
          }

          const d = parsed.data;
          const upd: Record<string, unknown> = {};
          if (d.title !== undefined) upd["title"] = d.title;
          if (d.summary !== undefined) upd["summary"] = d.summary;
          if (d.description !== undefined) upd["description"] = d.description;
          if (d.category !== undefined) upd["category"] = d.category;
          if (d.format !== undefined) upd["format"] = d.format;
          if (d.startAt !== undefined) upd["start_at"] = d.startAt;
          if (d.endAt !== undefined) upd["end_at"] = d.endAt;
          if (d.venue !== undefined) upd["venue"] = d.venue;
          if (d.city !== undefined) upd["city"] = d.city;
          if (d.country !== undefined) upd["country"] = d.country;
          if (d.registrationUrl !== undefined) upd["registration_url"] = d.registrationUrl;
          if (d.technologies !== undefined) upd["technologies"] = d.technologies;
          if (d.audience !== undefined) upd["audience"] = d.audience;
          if (d.isFree !== undefined) upd["is_free"] = d.isFree;
          if (d.status !== undefined) upd["status"] = d.status;

          const { data, error } = await auth!.client
            .from("events")
            .update(upd)
            .eq("id", params.id)
            .select("id, tenant_id")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new HttpError(404, "not_found", "Event not found or access denied.");

          if (hasAdminCredentials()) {
            await indexEventsBatch({
              eventIds: [data.id],
              workspaceId: data.tenant_id,
              auth,
              allowOpportunistic: true,
            }).catch(() => undefined);
          }

          return jsonResponse({ id: data.id, updated: true });
        } catch (err) {
          return errorResponse(err);
        }
      },

      DELETE: async ({ request, params }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, isValidUuid, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id)) throw new HttpError(400, "invalid_id", "Invalid event ID.");
          const { error } = await auth!.client.from("events").delete().eq("id", params.id);
          if (error) throw new Error(error.message);
          return jsonResponse({ deleted: true });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
