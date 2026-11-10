import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { UIComponent } from "@/lib/ui/schema";

type ComparisonProps = Extract<UIComponent, { type: "comparison_table" }>["props"];

export function ComparisonTableBlock({ props }: { props: ComparisonProps }) {
  const { setInspectedEvent } = useWorkspace();
  const [sortBy, setSortBy] = useState(props.sortBy);

  const sorted = useMemo(() => {
    return [...props.events].sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "category") return a.category.localeCompare(b.category) || a.startAt.localeCompare(b.startAt);
      if (sortBy === "format") return a.format.localeCompare(b.format) || a.startAt.localeCompare(b.startAt);
      return a.startAt.localeCompare(b.startAt);
    });
  }, [props.events, sortBy]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">{props.title}</CardTitle>
          {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {(["startAt", "category", "format", "score"] as const).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={sortBy === key ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setSortBy(key)}
            >
              {key === "startAt" ? "Date" : key === "score" ? "Relevance" : key.charAt(0).toUpperCase() + key.slice(1)}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              triggerDownload("event-comparison.csv", eventsToCsv(sorted as RankedEvent[]), "text/csv;charset=utf-8")
            }
          >
            <Download className="size-3" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Technologies</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="min-w-[200px] text-xs font-medium">
                    <button
                      type="button"
                      className="text-left hover:text-primary hover:underline"
                      onClick={() => setInspectedEvent(ev as RankedEvent)}
                    >
                      {ev.title}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">
                    {ev.startAt.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="secondary">{ev.category}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline">{FORMAT_LABELS[ev.format]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {ev.city ? `${ev.city}` : ev.venue ?? "Virtual"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {ev.technologies.slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{ev.isFree ? "Free" : "Paid"}</TableCell>
                  <TableCell className="text-xs font-semibold tabular-nums text-primary">
                    {Math.round(ev.score * 100)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
