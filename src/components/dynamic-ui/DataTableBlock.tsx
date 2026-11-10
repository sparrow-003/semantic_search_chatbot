import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { eventsToCsv, triggerDownload } from "@/lib/export";
import { FORMAT_LABELS, type RankedEvent } from "@/lib/events/types";
import { useWorkspace } from "@/lib/client/workspace-context";
import {
  ALLOWED_TABLE_COLUMNS,
  type DataTableConfig,
  type TableColumnKey,
  type UIComponent,
} from "@/lib/ui/schema";
import { cn } from "@/lib/utils";

type DataTableProps = Extract<UIComponent, { type: "data_table" }>["props"];

const COLUMN_LABELS: Record<TableColumnKey, string> = {
  title: "Event",
  category: "Category",
  format: "Format",
  startAt: "Date",
  endAt: "End Date",
  location: "Location",
  technologies: "Technologies",
  audience: "Audience",
  isFree: "Pricing",
  score: "Relevance",
  description: "Summary",
  explanation: "Match Reason",
};

export function DataTableBlock({ props }: { props: DataTableProps }) {
  const { setInspectedEvent } = useWorkspace();
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<DataTableConfig["sortBy"]>(props.config.sortBy);
  const [sortDir, setSortDir] = useState<DataTableConfig["sortDir"]>(props.config.sortDir);
  const [groupBy, setGroupBy] = useState<DataTableConfig["groupBy"]>(props.config.groupBy);
  const [visibleCols, setVisibleCols] = useState<TableColumnKey[]>(props.config.visibleColumns);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(props.config.pageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [colWidths, setColWidths] = useState<Partial<Record<TableColumnKey, number>>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = props.events.filter((e) => {
      if (formatFilter !== "all" && e.format !== formatFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.technologies.some((t) => t.toLowerCase().includes(q)) ||
        (e.city ?? "").toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "score":
          return (a.score - b.score) * mul;
        case "startAt":
          return a.startAt.localeCompare(b.startAt) * mul;
        case "title":
          return a.title.localeCompare(b.title) * mul;
        case "category":
          return a.category.localeCompare(b.category) * mul;
        case "format":
          return a.format.localeCompare(b.format) * mul;
      }
    });

    if (props.config.maxRows) {
      list = list.slice(0, props.config.maxRows);
    }
    return list;
  }, [props.events, props.config.maxRows, search, formatFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const groupedRows = useMemo(() => {
    if (groupBy === "none") return [{ group: "", rows: paged }];
    const map = new Map<string, typeof paged>();
    for (const r of paged) {
      const key =
        groupBy === "category"
          ? r.category
          : groupBy === "format"
            ? FORMAT_LABELS[r.format]
            : r.startAt.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([group, rows]) => ({ group, rows }));
  }, [groupBy, paged]);

  const toggleSort = (col: DataTableConfig["sortBy"]) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir(col === "score" ? "desc" : "asc");
    }
    setPage(1);
  };

  const toggleColumn = (col: TableColumnKey) => {
    setVisibleCols((prev) => {
      if (prev.includes(col)) {
        return prev.length > 1 ? prev.filter((c) => c !== col) : prev;
      }
      return [...prev, col];
    });
  };

  const exportRows = selectedIds.size
    ? filtered.filter((e) => selectedIds.has(e.id))
    : filtered;

  const isSortable = (c: TableColumnKey): c is DataTableConfig["sortBy"] =>
    c === "title" || c === "category" || c === "format" || c === "startAt" || c === "score";

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{props.title}</CardTitle>
            {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                triggerDownload("events-export.csv", eventsToCsv(exportRows as RankedEvent[]), "text/csv;charset=utf-8")
              }
            >
              <Download className="size-3.5" />
              Export CSV {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                triggerDownload(
                  "events-export.json",
                  JSON.stringify(exportRows, null, 2),
                  "application/json",
                )
              }
            >
              JSON
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              aria-label="Filter table rows"
              placeholder="Filter rows by title, tech, or city..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Select
            value={formatFilter}
            onValueChange={(v) => {
              setFormatFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[125px] text-xs" aria-label="Format filter">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="in_person">In person</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>

          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as DataTableConfig["groupBy"])}>
            <SelectTrigger className="h-8 w-[135px] text-xs" aria-label="Group rows by">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="category">Group: Category</SelectItem>
              <SelectItem value="format">Group: Format</SelectItem>
              <SelectItem value="month">Group: Month</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Columns3 className="size-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {ALLOWED_TABLE_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={visibleCols.includes(col)}
                  onCheckedChange={() => toggleColumn(col)}
                >
                  {COLUMN_LABELS[col]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {!filtered.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No table rows match the current filter.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all visible rows"
                      checked={paged.length > 0 && paged.every((r) => selectedIds.has(r.id))}
                      onCheckedChange={(checked) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) paged.forEach((r) => next.add(r.id));
                          else paged.forEach((r) => next.delete(r.id));
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                  {visibleCols.map((col) => (
                    <TableHead
                      key={col}
                      style={colWidths[col] ? { width: `${colWidths[col]}px` } : undefined}
                      className="group relative select-none whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between gap-1">
                        {isSortable(col) ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col)}
                            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                          >
                            {COLUMN_LABELS[col]}
                            {sortBy === col ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="size-3" />
                              ) : (
                                <ArrowDown className="size-3" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          <span>{COLUMN_LABELS[col]}</span>
                        )}
                        <span
                          role="separator"
                          aria-label={`Resize ${COLUMN_LABELS[col]} column`}
                          title="Click to cycle column width"
                          onClick={() =>
                            setColWidths((prev) => ({
                              ...prev,
                              [col]: prev[col] === 260 ? 160 : 260,
                            }))
                          }
                          className="h-4 w-1 cursor-col-resize rounded bg-border opacity-0 group-hover:opacity-100"
                        />
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows.map((grp) => (
                  <>
                    {grp.group && (
                      <TableRow key={`grp-${grp.group}`} className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={visibleCols.length + 1} className="py-1.5 text-xs font-semibold">
                          {grp.group} ({grp.rows.length})
                        </TableCell>
                      </TableRow>
                    )}
                    {grp.rows.map((ev) => (
                      <TableRow
                        key={ev.id}
                        data-state={selectedIds.has(ev.id) ? "selected" : undefined}
                        className={cn(props.config.density === "compact" && "[&>td]:py-1.5")}
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${ev.title}`}
                            checked={selectedIds.has(ev.id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(ev.id);
                                else next.delete(ev.id);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        {visibleCols.map((col) => (
                          <TableCell key={col} className="align-top text-xs">
                            {col === "title" && (
                              <button
                                type="button"
                                className="text-left font-medium text-foreground hover:text-primary hover:underline"
                                onClick={() => setInspectedEvent(ev as RankedEvent)}
                              >
                                {ev.title}
                              </button>
                            )}
                            {col === "category" && <Badge variant="secondary">{ev.category}</Badge>}
                            {col === "format" && <Badge variant="outline">{FORMAT_LABELS[ev.format]}</Badge>}
                            {col === "startAt" && (
                              <span className="whitespace-nowrap tabular-nums">{ev.startAt.slice(0, 10)}</span>
                            )}
                            {col === "endAt" && (
                              <span className="whitespace-nowrap tabular-nums">
                                {ev.endAt ? ev.endAt.slice(0, 10) : "—"}
                              </span>
                            )}
                            {col === "location" && (
                              <span>{ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ""}` : ev.venue ?? "Online"}</span>
                            )}
                            {col === "technologies" && (
                              <div className="flex max-w-[220px] flex-wrap gap-1">
                                {ev.technologies.slice(0, 4).map((t) => (
                                  <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            {col === "audience" && <span>{ev.audience.join(", ") || "—"}</span>}
                            {col === "isFree" && <span>{ev.isFree ? "Free" : "Paid"}</span>}
                            {col === "score" && (
                              <span className="font-semibold tabular-nums text-primary">
                                {Math.round(ev.score * 100)}%
                              </span>
                            )}
                            {col === "description" && (
                              <span className="line-clamp-2 max-w-xs text-muted-foreground">{ev.summary}</span>
                            )}
                            {col === "explanation" && (
                              <span className="line-clamp-2 max-w-xs text-muted-foreground">
                                {ev.explanation.summary}
                              </span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} events
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-7 w-[88px] text-xs" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 / page</SelectItem>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="tabular-nums">
              Page {safePage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
