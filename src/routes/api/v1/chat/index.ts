import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { filtersSchema, sanitizeFilters } from "@/lib/events/filters";
import { SEARCH_MODES } from "@/lib/events/types";

const chatBodySchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  mode: z.enum(SEARCH_MODES).default("hybrid"),
  model: z.string().max(80).nullable().optional(),
  explicitFilters: filtersSchema.partial().optional(),
  context: z
    .object({
      query: z.string().max(2000),
      searchText: z.string().max(2000),
      filters: filtersSchema,
      resultIds: z.array(z.string().uuid()).max(60),
      intent: z.string().max(60),
      at: z.string().max(60),
    })
    .nullable()
    .optional(),
  prevTableConfig: z.any().nullable().optional(),
  stream: z.boolean().optional(),
});

export const Route = createFileRoute("/api/v1/chat/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        const {
          checkRateLimit,
          errorResponse,
          getClientKey,
          jsonResponse,
          RATE_LIMITS,
          readBoundedJson,
        } = await import("@/lib/server/rate-limit.server");
        const { resolveAuthContext, HttpError } = await import("@/lib/server/supabase.server");
        const { runChatOrchestration } = await import("@/lib/server/orchestrator.server");

        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.chat);

          const rawBody = await readBoundedJson(request, 65_536);
          const parsed = chatBodySchema.safeParse(rawBody);
          if (!parsed.success) {
            throw new HttpError(
              400,
              "invalid_request",
              parsed.error.issues[0]?.message ?? "Invalid chat request.",
            );
          }

          const wantsStream =
            parsed.data.stream === true ||
            (request.headers.get("accept") ?? "").includes("text/event-stream");

          const chatInput = {
            message: parsed.data.message,
            sessionId: parsed.data.sessionId ?? null,
            workspaceId: parsed.data.workspaceId ?? null,
            mode: parsed.data.mode,
            model: parsed.data.model ?? null,
            ...(parsed.data.explicitFilters
              ? { explicitFilters: sanitizeFilters(parsed.data.explicitFilters) }
              : {}),
            context: parsed.data.context ?? null,
            prevTableConfig: parsed.data.prevTableConfig ?? null,
            auth,
            clientKey: getClientKey(request, auth?.userId),
          };

          if (!wantsStream) {
            const payload = await runChatOrchestration(chatInput);
            return jsonResponse(payload);
          }

          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const sendEvent = (event: string, data: unknown) => {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              };
              try {
                const payload = await runChatOrchestration(chatInput, (stage) => {
                  sendEvent("status", { stage });
                });
                sendEvent("result", payload);
                sendEvent("done", { ok: true });
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to process message.";
                sendEvent("error", { message: msg });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (err) {
          return errorResponse(err, requestId);
        }
      },
    },
  },
});
