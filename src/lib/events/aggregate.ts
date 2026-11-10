import { FORMAT_LABELS, type EventRecord } from "./types";

export const CHART_DIMENSIONS = ["category", "technology", "format", "month", "city", "audience"] as const;
export type ChartDimension = (typeof CHART_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<ChartDimension, string> = {
  category: "Category",
  technology: "Technology",
  format: "Format",
  month: "Month",
  city: "City",
  audience: "Audience",
};

export interface SeriesPoint {
  label: string;
  value: number;
}

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Deterministic count aggregation over authorized records only. */
export function groupCount(events: EventRecord[], dim: ChartDimension, top = 12): SeriesPoint[] {
  const counts = new Map<string, number>();
  const add = (k: string | null | undefined) => {
    if (!k) return;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  };
  for (const e of events) {
    switch (dim) {
      case "category":
        add(e.category);
        break;
      case "technology":
        e.technologies.forEach(add);
        break;
      case "format":
        add(FORMAT_LABELS[e.format]);
        break;
      case "month":
        add(monthKey(e.startAt));
        break;
      case "city":
        add(e.city ?? "Online");
        break;
      case "audience":
        e.audience.forEach(add);
        break;
    }
  }
  let entries = Array.from(counts.entries());
  if (dim === "month") {
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries.map(([k, v]) => ({ label: monthLabel(k), value: v }));
  }
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  entries = entries.slice(0, top);
  return entries.map(([label, value]) => ({ label, value }));
}

export interface Kpis {
  total: number;
  upcoming: number;
  online: number;
  inPerson: number;
  hybrid: number;
  free: number;
}

export function computeKpis(events: EventRecord[], now: Date = new Date()): Kpis {
  const nowIso = now.toISOString();
  return {
    total: events.length,
    upcoming: events.filter((e) => e.startAt >= nowIso).length,
    online: events.filter((e) => e.format === "online").length,
    inPerson: events.filter((e) => e.format === "in_person").length,
    hybrid: events.filter((e) => e.format === "hybrid").length,
    free: events.filter((e) => e.isFree).length,
  };
}

export function dateRange(events: EventRecord[]): { first: string | null; last: string | null } {
  if (!events.length) return { first: null, last: null };
  const sorted = events.map((e) => e.startAt).sort();
  return { first: sorted[0] ?? null, last: sorted[sorted.length - 1] ?? null };
}
