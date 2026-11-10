import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookmarkPlus,
  Download,
  Info,
  MessageSquarePlus,
  RotateCcw,
  Search as SearchIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ChartBlock } from "@/components/dynamic-ui/ChartBlock";
import { DataTableBlock } from "@/components/dynamic-ui/DataTableBlock";
import { EventCardsBlock } from "@/components/dynamic-ui/EventCardsBlock";
import { KpiCardsBlock } from "@/components/dynamic-ui/KpiCardsBlock";
import { TimelineBlock } from "@/components/dynamic-ui/TimelineKanbanChecklistReport";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadFacets, runHybridSearch } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";
import { computeKpis, groupCount } from "@/lib/events/aggregate";
import { EMPTY_FILTERS } from "@/lib/events/filters";
import {
  EVENT_FORMATS,
  FORMAT_LABELS,
  type EventFormat,
  type SearchFilters,
  type SearchMode,
} from "@/lib/events/types";
import { eventsToCsv, triggerDownload } from "@/lib/export";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [{ title: "Search Explorer — Scout" }],
  }),
  component: SearchExplorerPage,
});

function SearchExplorerPage() {
  const navigate = useNavigate();
  const {
    activeWorkspaceId,
    savedSearches,
    saveSearchPreset,
    removeSearchPreset,
    setPendingChatPrompt,
  } = useWorkspace();

  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [freeOnly, setFreeOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(queryInput), 280);
    return () => clearTimeout(t);
  }, [queryInput]);

  const { data: facets } = useQuery({
    queryKey: ["facets", activeWorkspaceId],
    queryFn: () => loadFacets(activeWorkspaceId),
  });

  const { data: searchData, isFetching, error } = useQuery({
    queryKey: ["search-explorer", debouncedQuery, mode, filters, freeOnly, activeWorkspaceId],
    queryFn: () =>
      runHybridSearch({
        query: debouncedQuery,
        mode,
        filters,
        freeOnly,
        workspaceId: activeWorkspaceId,
        limit: 48,
      }),
  });

  const events = searchData?.results ?? [];
  const kpis = computeKpis(events);

  const toggleFormat = (fmt: EventFormat) => {
    setFilters((prev) => ({
      ...prev,
      formats: prev.formats.includes(fmt)
        ? prev.formats.filter((x) => x !== fmt)
        : [...prev.formats, fmt],
    }));
  };

  const toggleCategory = (cat: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((x) => x !== cat)
        : [...prev.categories, cat],
    }));
  };

  const toggleTechnology = (tech: string) => {
    setFilters((prev) => ({
      ...prev,
      technologies: prev.technologies.includes(tech)
        ? prev.technologies.filter((x) => x !== tech)
        : [...prev.technologies, tech],
    }));
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Semantic &amp; Hybrid Search Explorer</h1>
            <p className="text-xs text-muted-foreground">
              Query events using meaning, keywords, and strict metadata filters with transparent match scores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                saveSearchPreset({
                  name: queryInput.trim() || "Filtered Event View",
                  query: queryInput,
                  mode,
                  filters,
                });
                toast.success("Saved search preset");
              }}
            >
              <BookmarkPlus className="size-3.5" /> Save Search
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={!events.length}
              onClick={() =>
                triggerDownload("scout-search-results.csv", eventsToCsv(events), "text/csv;charset=utf-8")
              }
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                setPendingChatPrompt(
                  queryInput.trim()
                    ? `Analyze "${queryInput.trim()}" and build a dashboard`
                    : "Build an analytics dashboard from upcoming events",
                );
                void navigate({ to: "/" });
              }}
            >
              <MessageSquarePlus className="size-3.5" /> Open in AI Chat
            </Button>
          </div>
        </div>

        {/* Search Input + Mode Bar */}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon className="absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Search events"
              placeholder="Search naturally — e.g. 'hands-on React performance workshop online' or 'pgvector'"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className="h-10 pl-9 text-sm"
            />
          </div>
          <Select value={mode} onValueChange={(v) => setMode(v as SearchMode)}>
            <SelectTrigger className="h-10 w-[160px] text-xs" aria-label="Search ranking mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hybrid">Hybrid (50/30/20)</SelectItem>
              <SelectItem value="semantic">Semantic Focus</SelectItem>
              <SelectItem value="keyword">Keyword Focus</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-1.5 text-xs"
            onClick={() => {
              setQueryInput("");
              setFilters(EMPTY_FILTERS);
              setFreeOnly(false);
            }}
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>

        {savedSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Saved searches:</span>
            {savedSearches.map((s) => (
              <div key={s.id} className="inline-flex items-center rounded-full border bg-card px-2.5 py-0.5 text-xs">
                <button
                  type="button"
                  className="hover:text-primary"
                  onClick={() => {
                    setQueryInput(s.query);
                    setMode(s.mode);
                    setFilters(s.filters);
                  }}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  className="ml-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSearchPreset(s.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {searchData && !searchData.semanticAvailable && mode !== "keyword" && (
          <Alert>
            <Info className="size-4" />
            <AlertDescription className="text-xs">
              Vector embeddings are not active in this environment yet — showing exact PostgreSQL full-text keyword and metadata filter results without fabricating vector scores.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Filters Rail */}
          <aside className="space-y-4 lg:col-span-3">
            <Card>
              <CardContent className="space-y-4 p-4 text-xs">
                <div className="space-y-2">
                  <div className="font-semibold">Format</div>
                  <div className="space-y-1.5">
                    {EVENT_FORMATS.map((fmt) => (
                      <label key={fmt} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={filters.formats.includes(fmt)}
                          onCheckedChange={() => toggleFormat(fmt)}
                        />
                        <span>{FORMAT_LABELS[fmt]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="font-semibold">Category</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(facets?.categories ?? []).map((cat) => {
                      const active = filters.categories.includes(cat);
                      return (
                        <Badge
                          key={cat}
                          variant={active ? "default" : "outline"}
                          className="cursor-pointer text-[11px]"
                          onClick={() => toggleCategory(cat)}
                        >
                          {cat}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="font-semibold">City</div>
                  <Select
                    value={filters.city ?? "__all__"}
                    onValueChange={(v) =>
                      setFilters((prev) => ({ ...prev, city: v === "__all__" ? null : v }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs" aria-label="Filter by city">
                      <SelectValue placeholder="Any city" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Any city</SelectItem>
                      {(facets?.cities ?? []).map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="font-semibold">Date Range</div>
                  <div className="space-y-1.5">
                    <Label htmlFor="search-start" className="text-[11px] text-muted-foreground">
                      From
                    </Label>
                    <Input
                      id="search-start"
                      type="date"
                      value={filters.dateStart ?? ""}
                      onChange={(e) =>
                        setFilters((p) => ({ ...p, dateStart: e.target.value || null }))
                      }
                      className="h-8 text-xs"
                    />
                    <Label htmlFor="search-end" className="text-[11px] text-muted-foreground">
                      Until
                    </Label>
                    <Input
                      id="search-end"
                      type="date"
                      value={filters.dateEnd ?? ""}
                      onChange={(e) =>
                        setFilters((p) => ({ ...p, dateEnd: e.target.value || null }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="border-t pt-3">
                  <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <Checkbox
                      checked={freeOnly}
                      onCheckedChange={(v) => setFreeOnly(Boolean(v))}
                    />
                    <span>Free events only</span>
                  </label>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="font-semibold">Technologies</div>
                  <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                    {(facets?.technologies ?? []).map((t) => {
                      const active = filters.technologies.includes(t);
                      return (
                        <Badge
                          key={t}
                          variant={active ? "default" : "secondary"}
                          className="cursor-pointer text-[11px]"
                          onClick={() => toggleTechnology(t)}
                        >
                          {t}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Results Area */}
          <div className="space-y-4 lg:col-span-9">
            <KpiCardsBlock
              props={{
                metrics: [
                  { id: "total", label: "Matched", value: kpis.total, accent: "primary" },
                  { id: "online", label: "Online", value: kpis.online, accent: "emerald" },
                  { id: "in_person", label: "In Person", value: kpis.inPerson, accent: "violet" },
                  { id: "free", label: "Free", value: kpis.free, accent: "amber" },
                ],
              }}
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  {error instanceof Error ? error.message : "Search failed"}
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="cards">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="cards" className="text-xs">Cards</TabsTrigger>
                  <TabsTrigger value="table" className="text-xs">Interactive Table</TabsTrigger>
                  <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
                  <TabsTrigger value="analytics" className="text-xs">Charts</TabsTrigger>
                </TabsList>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {isFetching
                    ? "Searching..."
                    : `${events.length} results (${searchData?.latencyMs ?? 0} ms)`}
                </span>
              </div>

              <TabsContent value="cards" className="mt-4">
                <EventCardsBlock
                  props={{
                    events,
                    showScores: true,
                  }}
                  query={debouncedQuery}
                />
              </TabsContent>

              <TabsContent value="table" className="mt-4">
                <DataTableBlock
                  props={{
                    title: "Search Results Table",
                    dataSource: "search_explorer",
                    events,
                    config: {
                      visibleColumns: [
                        "title",
                        "category",
                        "format",
                        "startAt",
                        "location",
                        "technologies",
                        "score",
                      ],
                      sortBy: "score",
                      sortDir: "desc",
                      groupBy: "none",
                      pageSize: 10,
                      density: "comfortable",
                    },
                  }}
                />
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <TimelineBlock
                  props={{
                    title: "Event Schedule Timeline",
                    events: [...events].sort((a, b) => a.startAt.localeCompare(b.startAt)),
                  }}
                />
              </TabsContent>

              <TabsContent value="analytics" className="mt-4 grid gap-4 md:grid-cols-2">
                <ChartBlock
                  props={{
                    title: "By Category",
                    chartType: "bar",
                    dimension: "category",
                    data: groupCount(events, "category", 10),
                    dataSource: "search_explorer",
                  }}
                />
                <ChartBlock
                  props={{
                    title: "Top Technologies",
                    chartType: "horizontal_bar",
                    dimension: "technology",
                    data: groupCount(events, "technology", 10),
                    dataSource: "search_explorer",
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

