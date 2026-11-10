import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DashboardBlock } from "@/components/dynamic-ui/DashboardBlock";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, runHybridSearch, type SavedDashboardItem } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { DashboardConfig } from "@/lib/ui/schema";

export const Route = createFileRoute("/dashboards/$id")({
  head: () => ({
    meta: [{ title: "Dashboard View — Scout" }],
  }),
  component: DashboardDetailPage,
});

function DashboardDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { user, activeWorkspaceId, localDashboards, saveLocalDashboard } = useWorkspace();

  const localMatch = localDashboards.find((d) => d.id === id) ?? null;

  const { data: remoteDash, isLoading: loadingDash } = useQuery({
    queryKey: ["dashboard", id, user?.id],
    enabled: Boolean(user),
    queryFn: () => apiFetch<{ dashboard: SavedDashboardItem }>(`/api/v1/dashboards/${id}`),
  });

  const dashboard = user ? remoteDash?.dashboard : localMatch;
  const config = dashboard?.configuration ?? null;

  const { data: eventsData, isLoading: loadingEvents } = useQuery({
    queryKey: ["dashboard-events", id, config?.query, config?.filters, activeWorkspaceId],
    enabled: Boolean(config),
    queryFn: () =>
      runHybridSearch({
        query: config!.query,
        mode: config!.mode,
        filters: config!.filters,
        workspaceId: user ? (remoteDash?.dashboard.tenant_id ?? activeWorkspaceId) : activeWorkspaceId,
        limit: 60,
      }),
  });

  const handleSaveConfig = async (nextConfig: DashboardConfig) => {
    if (user && remoteDash?.dashboard) {
      await apiFetch(`/api/v1/dashboards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: nextConfig.title,
          configuration: nextConfig,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", id] });
      toast.success("Dashboard saved");
    } else if (localMatch) {
      saveLocalDashboard(nextConfig.title, nextConfig);
      toast.success("Local dashboard updated");
    }
  };

  const toggleVisibility = async () => {
    if (!user || !remoteDash?.dashboard) return;
    const nextVis = remoteDash.dashboard.visibility === "private" ? "workspace" : "private";
    await apiFetch(`/api/v1/dashboards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility: nextVis }),
    });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", id] });
    toast.success(`Visibility changed to ${nextVis}`);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Link to="/dashboards">
              <ArrowLeft className="size-3.5" /> Back to Dashboards
            </Link>
          </Button>
          {user && remoteDash?.dashboard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => void toggleVisibility()}
            >
              {remoteDash.dashboard.visibility === "workspace" ? (
                <>
                  <Globe className="size-3.5 text-emerald-600" /> Shared with Workspace
                </>
              ) : (
                <>
                  <Lock className="size-3.5" /> Private
                </>
              )}
            </Button>
          )}
        </div>

        {(loadingDash && user) || loadingEvents || !config ? (
          <Skeleton className="h-[460px] w-full rounded-xl" />
        ) : (
          <DashboardBlock
            props={{
              config,
              events: eventsData?.results ?? [],
              dataSource: `dashboard:${id}`,
            }}
            onSaveExternal={handleSaveConfig}
          />
        )}
      </div>
    </AppShell>
  );
}
