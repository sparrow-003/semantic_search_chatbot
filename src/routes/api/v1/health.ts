import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async () => {
        const { jsonResponse } = await import("@/lib/server/rate-limit.server");
        const { isGatewayConfigured, ALLOWED_CHAT_MODELS, DEFAULT_CHAT_MODEL } =
          await import("@/lib/server/providers.server");
        const {
          createAnonSupabaseClient,
          getSupabasePublicConfig,
          hasAdminCredentials,
          isMissingSchemaError,
        } = await import("@/lib/server/supabase.server");

        const { url: supabaseUrl } = getSupabasePublicConfig();
        let schemaReady = false;
        let schemaError: string | null = null;
        let eventCount = 0;

        try {
          const client = createAnonSupabaseClient();
          const { data, error } = await client.from("events").select("id").limit(1);
          if (error) {
            schemaReady = false;
            schemaError = isMissingSchemaError(error)
              ? "Supabase schema is not initialized yet."
              : error.message;
          } else {
            schemaReady = true;
            eventCount = data?.length ?? 0;
          }
        } catch (err) {
          schemaError = err instanceof Error ? err.message : "Database check failed";
        }

        return jsonResponse({
          ok: true,
          service: "scout-semantic-workspace",
          supabaseUrl,
          schemaReady,
          hasEvents: eventCount > 0,
          ...(schemaError ? { schemaError } : {}),
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
