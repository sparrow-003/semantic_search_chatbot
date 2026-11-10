import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { EVENT_FORMATS } from "@/lib/events/types";

const eventInputSchema = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(400).default(""),
  description: z.string().trim().max(5000).default(""),
  category: z.string().trim().min(1).max(60),
  format: z.enum(EVENT_FORMATS),
  startAt: z.string().min(10).max(40),
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
  technologies: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  audience: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  isFree: z.boolean().default(false),
  status: z.enum(["draft", "published", "cancelled"]).default("published"),
});

export const Route = createFileRoute("/api/v1/events/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { errorResponse, jsonResponse } = await import("@/lib/server/rate-limit.server");
        const {
          resolveAuthContext,
          createAnonSupabaseClient,
          assertWorkspaceAccess,
          isValidUuid,
          HttpError,
        } = await import("@/lib/server/supabase.server");
        const { dbRowToEventRecord } = await import("@/lib/server/search.server");

        try {
          const auth = await resolveAuthContext(request);
          const url = new URL(request.url);
          const ws = url.searchParams.get("workspaceId");
          if (ws) {
            if (!isValidUuid(ws))
              throw new HttpError(400, "invalid_workspace", "Invalid workspaceId.");
            if (!auth) throw new HttpError(401, "unauthorized", "Authentication required.");
            await assertWorkspaceAccess(auth.client, auth.userId, ws);
          }

          const client = auth?.client ?? createAnonSupabaseClient();
          let query = client
            .from("events")
            .select(
              "id, tenant_id, title, summary, description, category, format, start_at, end_at, venue, city, country, registration_url, technologies, audience, is_free, status, index_status, index_error, updated_at",
            )
            .order("start_at", { ascending: true })
            .limit(100);

          if (ws) query = query.eq("tenant_id", ws);
          else query = query.is("tenant_id", null);

          const { data, error } = await query;
          if (error) throw new Error(error.message);
          const events = (data ?? []).map((r) => ({
            ...dbRowToEventRecord(r),
            status: r.status,
            indexStatus: r.index_status,
            indexError: r.index_error,
            updatedAt: r.updated_at,
          }));
          return jsonResponse({ events });
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
        const {
          resolveAuthContext,
          assertWorkspaceAccess,
          isPlatformAdmin,
          hasAdminCredentials,
          HttpError,
        } = await import("@/lib/server/supabase.server");
        const { indexEventsBatch } = await import("@/lib/server/indexing.server");

        try {
          const auth = await resolveAuthContext(request, { required: true });
          checkRateLimit(getClientKey(request, auth!.userId), RATE_LIMITS.default);
          const parsed = eventInputSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) {
            throw new HttpError(
              400,
              "invalid_request",
              parsed.error.issues[0]?.message ?? "Invalid event payload.",
            );
          }

          const ws = parsed.data.workspaceId ?? null;
          if (ws) {
            await assertWorkspaceAccess(auth!.client, auth!.userId, ws, "editor");
          } else {
            const adminRole = await isPlatformAdmin(auth!.client, auth!.userId);
            if (!adminRole) {
              throw new HttpError(
                403,
                "forbidden",
                "Select a workspace where you are an editor to create events.",
              );
            }
          }

          const { data, error } = await auth!.client
            .from("events")
            .insert({
              tenant_id: ws,
              title: parsed.data.title,
              summary: parsed.data.summary,
              description: parsed.data.description,
              category: parsed.data.category,
              format: parsed.data.format,
              start_at: parsed.data.startAt,
              end_at: parsed.data.endAt ?? null,
              venue: parsed.data.venue ?? null,
              city: parsed.data.city ?? null,
              country: parsed.data.country ?? null,
              registration_url: parsed.data.registrationUrl ?? null,
              technologies: parsed.data.technologies,
              audience: parsed.data.audience,
              is_free: parsed.data.isFree,
              status: parsed.data.status,
              created_by: auth!.userId,
            })
            .select("id")
            .single();

          if (error) throw new Error(error.message);

          if (data?.id && hasAdminCredentials()) {
            await indexEventsBatch({
              eventIds: [data.id],
              workspaceId: ws,
              auth,
              allowOpportunistic: true,
            }).catch(() => undefined);
          }

          return jsonResponse({ id: data.id, created: true }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
