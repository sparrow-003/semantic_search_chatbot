import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async () => {
        const { jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { isGatewayConfigured, ALLOWED_CHAT_MODELS, DEFAULT_CHAT_MODEL } =
          await import("@/lib/server/providers.server");
        const { hasAdminCredentials } = await import("@/lib/server/supabase.server");
        return jsonResponse({
          ok: true,
          service: "scout-semantic-workspace",
          gatewayConfigured: isGatewayConfigured(),
          adminConfigured: hasAdminCredentials(),
          defaultModel: DEFAULT_CHAT_MODEL,
          models: ALLOWED_CHAT_MODELS,
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
