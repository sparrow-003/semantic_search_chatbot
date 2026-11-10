import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  FileBarChart2,
  LayoutDashboard,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, type SavedDashboardItem } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { DashboardConfig } from "@/lib/ui/schema";

export const Route = createFileRoute("/dashboards/")({
  head: () => ({
    meta: [{ title: "Dashboards & Templates — Scout" }],
  }),
  component: DashboardsIndexPage,
});

const REPORT_TEMPLATES: Array<{
  name: string;
  description: string;
  config: Omit<DashboardConfig, "refreshedAt">;
}> = [
  {
    name: "React & Next.js December Online Brief",
    description: "Online frontend workshops & conferences scheduled for December 2026.",
    config: {
      title: "React & Next.js December Online Brief",
      description: "Focused snapshot of online React/Next.js events next month",
      query: "React Next.js",
      mode: "hybrid",
      filters: {
        formats: ["online"],
        categories: [],
        technologies: ["React", "Next.js"],
        dateStart: "2026-12-01",
        dateEnd: "2026-12-31",
        city: null,
      },
      widgets: [
        { id: "k1", kind: "metric", title: "Matching Events", colSpan: 4, metricKey: "total" },
        { id: "k2", kind: "metric", title: "Online Events", colSpan: 4, metricKey: "online" },
        { id: "k3", kind: "metric", title: "Free Entry", colSpan: 4, metricKey: "free" },
        { id: "c1", kind: "chart", title: "By Category", colSpan: 6, chartType: "bar", dimension: "category" },
        { id: "c2", kind: "chart", title: "By Technology", colSpan: 6, chartType: "horizontal_bar", dimension: "technology" },
        { id: "t1", kind: "table", title: "Scheduled Events", colSpan: 12 },
      ],
    },
  },
  {
    name: "AI, LLM & Vector Search Ecosystem",
    description: "Global AI, LLM, and Machine Learning conferences, hackathons, and webinars.",
    config: {
      title: "AI, LLM & Vector Search Ecosystem",
      description: "Cross-format breakdown of AI engineering & ML events",
      query: "AI LLM Machine Learning",
      mode: "hybrid",
      filters: {
        formats: [],
        categories: [],
        technologies: ["AI", "LLM", "Machine Learning"],
        dateStart: null,
        dateEnd: null,
        city: null,
      },
      widgets: [
        { id: "k1", kind: "metric", title: "Total AI Events", colSpan: 4, metricKey: "total" },
        { id: "k2", kind: "metric", title: "Online", colSpan: 4, metricKey: "online" },
        { id: "k3", kind: "metric", title: "In Person", colSpan: 4, metricKey: "inPerson" },
        { id: "c1", kind: "chart", title: "Format Split", colSpan: 6, chartType: "donut", dimension: "format" },
        { id: "c2", kind: "chart", title: "Monthly Pipeline", colSpan: 6, chartType: "line", dimension: "month" },
        { id: "t1", kind: "table", title: "AI Events Directory", colSpan: 12 },
      ],
    },
  },
  {
    name: "Full Catalog Executive Overview",
    description: "All 48+ events across categories, cities, technologies, and upcoming months.",
    config: {
      title: "Full Catalog Executive Overview",
      description: "Complete multi-dimension analytics across authorized events",
      query: "",
      mode: "hybrid",
      filters: {
        formats: [],
        categories: [],
        technologies: [],
        dateStart: null,
        dateEnd: null,
        city: null,
      },
      widgets: [
        { id: "k1", kind: "metric", title: "Total Events", colSpan: 4, metricKey: "total" },
        { id: "k2", kind: "metric", title: "Upcoming", colSpan: 4, metricKey: "upcoming" },
        { id: "k3", kind: "metric", title: "Free Events", colSpan: 4, metricKey: "free" },
        { id: "c1", kind: "chart", title: "Categories", colSpan: 6, chartType: "bar", dimension: "category" },
        { id: "c2", kind: "chart", title: "Top Technologies", colSpan: 6, chartType: "horizontal_bar", dimension: "technology" },
        { id: "c3", kind: "chart", title: "Cities", colSpan: 6, chartType: "pie", dimension: "city" },
        { id: "c4", kind: "chart", title: "Monthly Trend", colSpan: 6, chartType: "area", dimension: "month" },
        { id: "t1", kind: "table", title: "All Events", colSpan: 12 },
      ],
    },
  },
];

function DashboardsIndexPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, workspaces, activeWorkspaceId, localDashboards, saveLocalDashboard, deleteLocalDashboard } =
    useWorkspace();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: remoteData, isLoading } = useQuery({
    queryKey: ["saved-dashboards", user?.id, activeWorkspaceId],
    enabled: Boolean(user),
    queryFn: () =>
      apiFetch<{ dashboards: SavedDashboardItem[] }>(
        activeWorkspaceId
          ? `/api/v1/dashboards?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
          : "/api/v1/dashboards",
      ),
  });

  const targetWsId = activeWorkspaceId ?? workspaces[0]?.id ?? null;

  const createFromConfig = async (name: string, cfg: DashboardConfig) => {
    setCreating(true);
    try {
      if (user && targetWsId) {
        const res = await apiFetch<{ dashboard: SavedDashboardItem }>("/api/v1/dashboards", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: targetWsId,
            name,
            visibility: "private",
            configuration: cfg,
          }),
        });
        await queryClient.invalidateQueries({ queryKey: ["saved-dashboards"] });
        toast.success(`Created "${name}"`);
        void navigate({ to: "/dashboards/$id", params: { id: res.dashboard.id } });
      } else {
        const draft = saveLocalDashboard(name, cfg);
        toast.success(`Created local dashboard "${name}"`);
        void navigate({ to: "/dashboards/$id", params: { id: draft.id } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create dashboard");
    } finally {
      setCreating(false);
    }
  };

  const dashboards = user ? remoteData?.dashboards ?? [] : localDashboards;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboards &amp; Report Templates</h1>
            <p className="text-xs text-muted-foreground">
              Save, customize, share with your workspace, and export live analytics dashboards.
            </p>
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              const tpl = REPORT_TEMPLATES[2]!;
              void createFromConfig(newName.trim(), {
                ...tpl.config,
                title: newName.trim(),
                refreshedAt: new Date().toISOString(),
              });
              setNewName("");
            }}
          >
            <Input
              aria-label="New dashboard name"
              placeholder="New dashboard title..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 w-56 text-xs"
            />
            <Button type="submit" size="sm" disabled={creating || !newName.trim()} className="gap-1.5">
              <Plus className="size-3.5" /> Create
            </Button>
          </form>
        </div>

        {/* Saved Dashboards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {user ? "Workspace & Personal Dashboards" : "Local Dashboards (Guest Session)"}
            </h2>
          </div>

          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading dashboards...</div>
          ) : !dashboards.length ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No saved dashboards yet. Pick a template below or ask the AI Workspace to build one.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboards.map((d) => (
                <Card key={d.id} className="flex flex-col justify-between">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[11px]">
                        {d.visibility}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {d.configuration?.widgets?.length ?? 0} widgets
                      </span>
                    </div>
                    <CardTitle className="mt-1 text-base">{d.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {d.configuration?.description ?? "Authorized event analytics"}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex items-center justify-between border-t pt-3">
                    <Button asChild size="sm" variant="default" className="h-8 gap-1.5 text-xs">
                      <Link to="/dashboards/$id" params={{ id: d.id }}>
                        <LayoutDashboard className="size-3.5" /> Open
                      </Link>
                    </Button>
                    <div className="flex items-center gap-1">
                      {user && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title="Duplicate dashboard"
                          onClick={async () => {
                            await apiFetch(`/api/v1/dashboards/${d.id}/duplicate`, { method: "POST" });
                            await queryClient.invalidateQueries({ queryKey: ["saved-dashboards"] });
                            toast.success("Dashboard duplicated");
                          }}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        title="Delete dashboard"
                        onClick={async () => {
                          if (user) {
                            await apiFetch(`/api/v1/dashboards/${d.id}`, { method: "DELETE" });
                            await queryClient.invalidateQueries({ queryKey: ["saved-dashboards"] });
                          } else {
                            deleteLocalDashboard(d.id);
                          }
                          toast.success("Dashboard deleted");
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Reusable Templates */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <FileBarChart2 className="size-4" /> Reusable Report &amp; Dashboard Templates
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {REPORT_TEMPLATES.map((tpl) => (
              <Card key={tpl.name} className="flex flex-col justify-between bg-muted/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="size-4 text-primary" />
                    {tpl.name}
                  </CardTitle>
                  <CardDescription className="text-xs">{tpl.description}</CardDescription>
                </CardHeader>
                <CardFooter className="pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    disabled={creating}
                    onClick={() =>
                      void createFromConfig(tpl.name, {
                        ...tpl.config,
                        refreshedAt: new Date().toISOString(),
                      })
                    }
                  >
                    Use Template
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
