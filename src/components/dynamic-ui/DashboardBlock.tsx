import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUp,
  Download,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, runHybridSearch } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";
import {
  CHART_DIMENSIONS,
  computeKpis,
  DIMENSION_LABELS,
  groupCount,
  type ChartDimension,
} from "@/lib/events/aggregate";
import { eventMatchesFilters } from "@/lib/events/filters";
import type { EventFormat, RankedEvent, SearchFilters } from "@/lib/events/types";
import { eventsToCsv, eventsToMarkdownReport, triggerDownload } from "@/lib/export";
import {
  ALLOWED_CHART_TYPES,
  type ChartType,
  type DashboardConfig,
  type UIComponent,
} from "@/lib/ui/schema";
import { cn } from "@/lib/utils";
import { DataTableBlock } from "./DataTableBlock";

const LazyChartBlock = lazy(() =>
  import("./ChartBlock").then((m) => ({ default: m.ChartBlock })),
);

type DashboardProps = Extract<UIComponent, { type: "dashboard" }>["props"];

export function DashboardBlock({
  props,
  editable = true,
  onSaveExternal,
}: {
  props: DashboardProps;
  editable?: boolean;
  onSaveExternal?: (config: DashboardConfig) => Promise<void> | void;
}) {
  const { user, workspaces, activeWorkspaceId, saveLocalDashboard } = useWorkspace();
  const [config, setConfig] = useState<DashboardConfig>(props.config);
  const [events, setEvents] = useState<RankedEvent[]>(props.events as RankedEvent[]);
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [dateStart, setDateStart] = useState<string>(props.config.filters.dateStart ?? "");
  const [dateEnd, setDateEnd] = useState<string>(props.config.filters.dateEnd ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingWidget, setAddingWidget] = useState(false);
  const [newWidgetDim, setNewWidgetDim] = useState<ChartDimension>("city");
  const [newWidgetType, setNewWidgetType] = useState<ChartType>("bar");

  const categories = useMemo(
    () => Array.from(new Set(events.map((e) => e.category))).sort(),
    [events],
  );
  const technologies = useMemo(
    () => Array.from(new Set(events.flatMap((e) => e.technologies))).sort(),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const f: SearchFilters = {
      formats: formatFilter === "all" ? [] : [formatFilter as EventFormat],
      categories: categoryFilter === "all" ? [] : [categoryFilter],
      technologies: techFilter === "all" ? [] : [techFilter],
      dateStart: dateStart || null,
      dateEnd: dateEnd || null,
      city: null,
    };
    return events.filter((e) => eventMatchesFilters(e, f));
  }, [events, formatFilter, categoryFilter, techFilter, dateStart, dateEnd]);

  const kpis = useMemo(() => computeKpis(filteredEvents), [filteredEvents]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await runHybridSearch({
        query: config.query,
        mode: config.mode,
        filters: {
          ...config.filters,
          ...(dateStart ? { dateStart } : {}),
          ...(dateEnd ? { dateEnd } : {}),
        },
        workspaceId: activeWorkspaceId,
        limit: 60,
      });
      setEvents(res.results);
      setConfig((prev) => ({ ...prev, refreshedAt: new Date().toISOString() }));
      toast.success(`Refreshed ${res.results.length} authorized events`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh dashboard");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (onSaveExternal) {
        await onSaveExternal(config);
        return;
      }
      const targetWsId = activeWorkspaceId ?? workspaces[0]?.id ?? null;
      if (user && targetWsId) {
        await apiFetch("/api/v1/dashboards", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: targetWsId,
            name: config.title,
            visibility: "private",
            configuration: config,
          }),
        });
        toast.success("Dashboard saved to your workspace");
      } else {
        saveLocalDashboard(config.title, config);
        toast.success("Dashboard saved locally (sign in to sync to workspace)");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save dashboard");
    } finally {
      setSaving(false);
    }
  };

  const moveWidgetUp = (idx: number) => {
    if (idx <= 0) return;
    setConfig((prev) => {
      const next = [...prev.widgets];
      const temp = next[idx - 1]!;
      next[idx - 1] = next[idx]!;
      next[idx] = temp;
      return { ...prev, widgets: next };
    });
  };

  const cycleWidgetSpan = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) =>
        w.id === id
          ? { ...w, colSpan: w.colSpan === 4 ? 6 : w.colSpan === 6 ? 12 : 4 }
          : w,
      ),
    }));
  };

  const removeWidget = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.length > 1 ? prev.widgets.filter((w) => w.id !== id) : prev.widgets,
    }));
  };

  const addChartWidget = () => {
    setConfig((prev) => ({
      ...prev,
      widgets: [
        ...prev.widgets,
        {
          id: `w_custom_${Date.now()}`,
          kind: "chart",
          title: `Events by ${DIMENSION_LABELS[newWidgetDim]}`,
          colSpan: 6,
          chartType: newWidgetType,
          dimension: newWidgetDim,
        },
      ],
    }));
    setAddingWidget(false);
  };

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="space-y-3 border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{config.title}</CardTitle>
              <Badge variant="secondary" className="text-[11px] tabular-nums">
                {filteredEvents.length} records
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {config.description ?? "Authorized live aggregation"} · Last refreshed{" "}
              {new Date(config.refreshedAt).toLocaleTimeString()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setAddingWidget((v) => !v)}
              >
                <Plus className="size-3.5" /> Widget
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={saving}
              onClick={handleSave}
            >
              <Save className="size-3.5" /> Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                triggerDownload(
                  "dashboard-events.csv",
                  eventsToCsv(filteredEvents),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="size-3.5" /> CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                triggerDownload(
                  "dashboard-report.md",
                  eventsToMarkdownReport(config.title, filteredEvents),
                  "text/markdown;charset=utf-8",
                )
              }
            >
              Report
            </Button>
          </div>
        </div>

        {/* Interactive Dashboard Filter Bar */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="h-8 text-xs" aria-label="Dashboard format filter">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="in_person">In person</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 text-xs" aria-label="Dashboard category filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={techFilter} onValueChange={setTechFilter}>
            <SelectTrigger className="h-8 text-xs" aria-label="Dashboard technology filter">
              <SelectValue placeholder="Technology" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All technologies</SelectItem>
              {technologies.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            aria-label="Filter start date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            type="date"
            aria-label="Filter end date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        {addingWidget && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <span className="text-xs font-medium">Add Chart Widget:</span>
            <Select value={newWidgetDim} onValueChange={(v) => setNewWidgetDim(v as ChartDimension)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHART_DIMENSIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIMENSION_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newWidgetType} onValueChange={(v) => setNewWidgetType(v as ChartType)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_CHART_TYPES.filter((t) => t !== "stacked_bar").map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={addChartWidget}>
              Add to Canvas
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4">
        {!filteredEvents.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No events match the active dashboard filters. Clear a filter above to restore metrics.
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {config.widgets.map((widget, idx) => {
              const spanClass =
                widget.colSpan === 4
                  ? "col-span-12 sm:col-span-6 lg:col-span-4"
                  : widget.colSpan === 8
                    ? "col-span-12 lg:col-span-8"
                    : widget.colSpan === 12
                      ? "col-span-12"
                      : "col-span-12 lg:col-span-6";

              return (
                <div key={widget.id} className={cn("group relative", spanClass)}>
                  {editable && (
                    <div className="mb-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        title="Move earlier"
                        onClick={() => moveWidgetUp(idx)}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        title="Resize widget width"
                        onClick={() => cycleWidgetSpan(widget.id)}
                      >
                        <ArrowLeftRight className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-destructive"
                        title="Remove widget"
                        onClick={() => removeWidget(widget.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  )}

                  {widget.kind === "metric" && (
                    <Card className="bg-muted/20">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground">{widget.title}</div>
                        <div className="mt-1.5 text-3xl font-bold tabular-nums">
                          {kpis[widget.metricKey ?? "total"]}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {widget.kind === "text" && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{widget.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">
                        {widget.textContent}
                      </CardContent>
                    </Card>
                  )}

                  {widget.kind === "chart" && (
                    <Suspense fallback={<Skeleton className="h-[340px] w-full rounded-xl" />}>
                      <LazyChartBlock
                        props={{
                          title: widget.title,
                          chartType: widget.chartType ?? "bar",
                          dimension: widget.dimension ?? "category",
                          data: groupCount(filteredEvents, widget.dimension ?? "category", 10),
                          dataSource: props.dataSource,
                          provenanceNote: `Computed over ${filteredEvents.length} filtered records`,
                        }}
                      />
                    </Suspense>
                  )}

                  {widget.kind === "table" && (
                    <DataTableBlock
                      props={{
                        title: widget.title,
                        dataSource: props.dataSource,
                        events: filteredEvents,
                        config: widget.tableConfig ?? {
                          visibleColumns: ["title", "category", "format", "startAt", "location", "score"],
                          sortBy: "startAt",
                          sortDir: "asc",
                          groupBy: "none",
                          pageSize: 8,
                          density: "compact",
                        },
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
