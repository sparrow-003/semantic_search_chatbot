import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const feedbackSchema = z.object({
  messageId: z.string().max(120).optional(),
  query: z.string().max(2000).optional(),
  rating: z.enum(["useful", "irrelevant", "incorrect_info", "incorrect_explanation"]),
  comment: z.string().max(1000).optional(),
});

export const Route = createFileRoute("/api/v1/search/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          errorResponse,
          jsonResponse,
          readBoundedJson,
          checkRateLimit,
          getClientKey,
          RATE_LIMITS,
        } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, getAdminSupabaseClientOptional, HttpError } = await import(
          "@/lib/server/supabase.server"
        );
        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.default);
          const parsed = feedbackSchema.safeParse(await readBoundedJson(request));
          if (!parsed.success) {
            throw new HttpError(400, "invalid_request", "Invalid feedback submission.");
          }

          const admin = await getAdminSupabaseClientOptional();
          if (admin) {
            await admin.from("feedback").insert({
              user_id: auth?.userId ?? null,
              message_id: parsed.data.messageId ?? null,
              query: parsed.data.query ?? null,
              rating: parsed.data.rating,
              comment: parsed.data.comment ?? null,
            });
          }
          return jsonResponse({ recorded: true, persisted: Boolean(admin) }, 201);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

