import { createFileRoute } from "@tanstack/react-router";

/**
 * Validate the caller's own OpenRouter key and list the free models it can use.
 * The key is read from a request header, forwarded to openrouter.ai only, and
 * never stored or echoed back.
 */
export const Route = createFileRoute("/api/v1/openrouter/models")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkRateLimit, errorResponse, getClientKey, jsonResponse, RATE_LIMITS } =
          await import("@/lib/server/rate-limit.server");
        const { HttpError, resolveAuthContext } = await import("@/lib/server/supabase.server");
        const {
          OPENROUTER_KEY_HEADER,
          fetchOpenRouterFreeModels,
          fetchOpenRouterKeyInfo,
          isValidOpenRouterKeyFormat,
        } = await import("@/lib/server/openrouter.server");
        try {
          const auth = await resolveAuthContext(request);
          checkRateLimit(getClientKey(request, auth?.userId), RATE_LIMITS.chat);
          const key = request.headers.get(OPENROUTER_KEY_HEADER);
          if (!isValidOpenRouterKeyFormat(key)) {
            throw new HttpError(
              400,
              "openrouter_key_invalid_format",
              "That doesn't look like an OpenRouter key. Keys start with “sk-or-”.",
            );
          }
          const [keyInfo, models] = await Promise.all([
            fetchOpenRouterKeyInfo(key),
            fetchOpenRouterFreeModels(),
          ]);
          return jsonResponse({ key: keyInfo, models });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});
