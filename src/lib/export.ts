import type { EventRecord, RankedEvent } from "@/lib/events/types";
import { FORMAT_LABELS } from "@/lib/events/types";

/** Prevent spreadsheet formula injection (=, +, -, @, tab, CR) on CSV cell values. */
export function escapeCsvCell(raw: unknown): string {
  const s = raw == null ? "" : String(raw);
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function eventsToCsv(events: Array<EventRecord | RankedEvent>): string {
  const headers = [
    "Title",
    "Category",
    "Format",
    "Start Date",
    "City",
    "Country",
    "Venue",
    "Technologies",
    "Audience",
    "Free",
    "Relevance Score",
    "Registration URL",
  ];
  const rows = events.map((e) => [
    e.title,
    e.category,
    FORMAT_LABELS[e.format],
    e.startAt.slice(0, 10),
    e.city ?? "",
    e.country ?? "",
    e.venue ?? "",
    e.technologies.join("; "),
    e.audience.join("; "),
    e.isFree ? "Yes" : "No",
    "score" in e ? `${Math.round(e.score * 100)}%` : "",
    e.registrationUrl ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function eventsToMarkdownReport(
  title: string,
  events: Array<EventRecord | RankedEvent>,
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Total Events: ${events.length}`,
    "",
    "| Title | Date | Category | Format | Location | Technologies |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const e of events) {
    const loc = e.city ? `${e.city}${e.country ? `, ${e.country}` : ""}` : "Online";
    lines.push(
      `| ${e.title.replace(/\|/g, "\\|")} | ${e.startAt.slice(0, 10)} | ${e.category} | ${FORMAT_LABELS[e.format]} | ${loc} | ${e.technologies.join(", ")} |`,
    );
  }
  return lines.join("\n");
}

export function triggerDownload(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
