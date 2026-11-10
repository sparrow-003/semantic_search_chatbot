import { useMemo, useState } from "react";
import { Calendar, CheckSquare, Download, FileText, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { eventsToCsv, eventsToMarkdownReport, triggerDownload } from "@/lib/export";
import { FORMAT_LABELS, type RankedEvent } from "@/lib/events/types";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { UIComponent } from "@/lib/ui/schema";
import { cn } from "@/lib/utils";

type TimelineProps = Extract<UIComponent, { type: "timeline" }>["props"];
type KanbanProps = Extract<UIComponent, { type: "kanban" }>["props"];
type ChecklistProps = Extract<UIComponent, { type: "checklist" }>["props"];
type ReportProps = Extract<UIComponent, { type: "report_summary" }>["props"];

export function TimelineBlock({ props }: { props: TimelineProps }) {
  const { setInspectedEvent } = useWorkspace();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{props.title}</CardTitle>
        {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
      </CardHeader>
      <CardContent>
        <ol className="relative ml-3 space-y-5 border-l border-border pl-6">
          {props.events.map((ev) => (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[31px] top-1 flex size-3.5 items-center justify-center rounded-full border-2 border-primary bg-background" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-primary">
                  <Calendar className="size-3.5" />
                  {new Date(ev.startAt).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">{ev.category}</Badge>
                  <Badge variant="outline" className="text-[11px]">{FORMAT_LABELS[ev.format]}</Badge>
                </div>
              </div>
              <button
                type="button"
                className="mt-1 text-left text-sm font-semibold text-foreground hover:text-primary hover:underline"
                onClick={() => setInspectedEvent(ev as RankedEvent)}
              >
                {ev.title}
              </button>
              <p className="mt-0.5 text-xs text-muted-foreground">{ev.summary}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {ev.city ? `${ev.city}, ${ev.country}` : ev.venue ?? "Virtual"}
                </span>
                <span>·</span>
                <span>{ev.technologies.slice(0, 4).join(", ")}</span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function KanbanBlock({ props }: { props: KanbanProps }) {
  const { setInspectedEvent } = useWorkspace();
  const columns = useMemo(() => {
    const map = new Map<string, KanbanProps["events"]>();
    for (const ev of props.events) {
      const key =
        props.groupBy === "format"
          ? FORMAT_LABELS[ev.format]
          : props.groupBy === "month"
            ? ev.startAt.slice(0, 7)
            : ev.category;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [props.events, props.groupBy]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{props.title}</CardTitle>
        {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {columns.map(([colTitle, items]) => (
            <div key={colTitle} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>{colTitle}</span>
                <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setInspectedEvent(ev as RankedEvent)}
                    className="w-full rounded-md border bg-card p-2.5 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="text-xs font-medium leading-snug text-foreground">{ev.title}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{ev.startAt.slice(0, 10)}</span>
                      <span>{ev.isFree ? "Free" : "Paid"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChecklistBlock({ props }: { props: ChecklistProps }) {
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    props.items.forEach((it) => {
      m[it.id] = it.checked;
    });
    return m;
  });
  const doneCount = Object.values(checkedMap).filter(Boolean).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="size-4 text-primary" />
            {props.title}
          </CardTitle>
          {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
        </div>
        <Badge variant="secondary" className="tabular-nums">
          {doneCount} / {props.items.length} done
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {props.items.map((item) => {
          const isChecked = Boolean(checkedMap[item.id]);
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors hover:bg-muted/40"
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(v) => setCheckedMap((p) => ({ ...p, [item.id]: Boolean(v) }))}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className={cn("text-xs font-medium", isChecked && "line-through text-muted-foreground")}>
                  {item.label}
                </div>
                {item.detail && <div className="text-[11px] text-muted-foreground">{item.detail}</div>}
              </div>
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ReportSummaryBlock({ props }: { props: ReportProps }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" />
            {props.title}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Generated {new Date(props.generatedAt).toLocaleString()} · Query: &ldquo;{props.querySummary}&rdquo;
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              triggerDownload(
                "scout-report.md",
                eventsToMarkdownReport(props.title, props.events as RankedEvent[]),
                "text/markdown;charset=utf-8",
              )
            }
          >
            <Download className="size-3" /> Markdown
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              triggerDownload(
                "scout-report.csv",
                eventsToCsv(props.events as RankedEvent[]),
                "text/csv;charset=utf-8",
              )
            }
          >
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              triggerDownload(
                "scout-report.json",
                JSON.stringify(props, null, 2),
                "application/json",
              )
            }
          >
            JSON
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="space-y-1.5">
          <h4 className="font-semibold uppercase tracking-wider text-muted-foreground">Key Findings</h4>
          <ul className="list-disc space-y-1 pl-5 text-foreground">
            {props.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <h4 className="mb-2 font-semibold">Categories</h4>
            <div className="space-y-1">
              {props.topCategories.map((c) => (
                <div key={c.label} className="flex justify-between">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-medium tabular-nums">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <h4 className="mb-2 font-semibold">Top Technologies</h4>
            <div className="space-y-1">
              {props.topTechnologies.map((t) => (
                <div key={t.label} className="flex justify-between">
                  <span className="text-muted-foreground">{t.label}</span>
                  <span className="font-medium tabular-nums">{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
