import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { eventsToCsv, eventsToMarkdownReport } from "@/lib/export";
import { dashboardConfigSchema } from "@/lib/ui/schema";

const exportBodySchema = z.object({
  format: z.enum(["json", "csv", "markdown"]).default("json"),
});

export const Route = createFileRoute("/api/v1/dashboards/$id/export")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { errorResponse, jsonResponse, readBoundedJson } = await import(
          "@/lib/server/rate-limit.server"
        );
        const {
          resolveAuthContext,
          getAdminSupabaseClientOptional,
          isValidUuid,
          HttpError,
        } = await import("@/lib/server/supabase.server");
        const { executeSearch } = await import("@/lib/server/search.server");

        try {
          const auth = await resolveAuthContext(request, { required: true });
          if (!isValidUuid(params.id)) throw new HttpError(400, "invalid_id", "Invalid dashboard ID.");
          const body = exportBodySchema.safeParse(await readBoundedJson(request));
          if (!body.success) throw new HttpError(400, "invalid_request", "Invalid export format.");

          const { data: dash, error } = await auth!.client
            .from("saved_dashboards")
            .select("id, tenant_id, name, configuration")
            .eq("id", params.id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!dash) throw new HttpError(404, "not_found", "Dashboard not found.");

          const parsedCfg = dashboardConfigSchema.safeParse(dash.configuration);
          const cfg = parsedCfg.success ? parsedCfg.data : null;

          const searchRes = await executeSearch({
            query: cfg?.query ?? "",
            mode: cfg?.mode ?? "hybrid",
            ...(cfg?.filters ? { filters: cfg.filters } : {}),
            workspaceId: dash.tenant_id,
            limit: 60,
            auth,
            intent: "dashboard_export",
          });

          const slug = dash.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dashboard";
          const admin = await getAdminSupabaseClientOptional();
          if (admin) {
            void admin
              .from("audit_logs")
              .insert({
                tenant_id: dash.tenant_id,
                actor_id: auth!.userId,
                action: "export",
                resource_type: "saved_dashboards",
                resource_id: dash.id,
                metadata: { format: body.data.format, rowCount: searchRes.results.length },
              })
              .then(() => undefined, () => undefined);
          }

          if (body.data.format === "csv") {
            return jsonResponse({
              filename: `${slug}.csv`,
              mimeType: "text/csv;charset=utf-8",
              content: eventsToCsv(searchRes.results),
            });
          }
          if (body.data.format === "markdown") {
            return jsonResponse({
              filename: `${slug}.md`,
              mimeType: "text/markdown;charset=utf-8",
              content: eventsToMarkdownReport(dash.name, searchRes.results),
            });
          }
          return jsonResponse({
            filename: `${slug}.json`,
            mimeType: "application/json;charset=utf-8",
            content: JSON.stringify(
              {
                dashboard: { id: dash.id, name: dash.name, configuration: dash.configuration },
                exportedAt: new Date().toISOString(),
                events: searchRes.results,
              },
              null,
              2,
            ),
          });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },
  },
});

