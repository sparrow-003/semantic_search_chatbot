import { z } from "zod";
import {
  EMPTY_FILTERS,
  EVENT_FORMATS,
  FORMAT_LABELS,
  type EventRecord,
  type SearchFilters,
} from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Invalid date");

const shortText = z.string().trim().min(1).max(60);

export const filtersSchema = z.object({
  formats: z.array(z.enum(EVENT_FORMATS)).max(3).default([]),
  categories: z.array(shortText).max(10).default([]),
  technologies: z.array(shortText).max(12).default([]),
  dateStart: isoDate.nullable().default(null),
  dateEnd: isoDate.nullable().default(null),
  city: shortText.nullable().default(null),
});

/**
 * Validate extracted or user-supplied constraints before they are applied.
 * Invalid values are dropped rather than trusted; reversed date ranges are swapped.
 */
export function sanitizeFilters(raw: unknown): SearchFilters {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
  };
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.filter((x) => {
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const formats = Array.isArray(input["formats"])
    ? (input["formats"] as unknown[]).filter((f): f is SearchFilters["formats"][number] =>
        (EVENT_FORMATS as readonly unknown[]).includes(f),
      )
    : [];
  const strList = (v: unknown, max: number) =>
    Array.isArray(v)
      ? uniq(
          v
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter((x) => x.length > 0 && x.length <= 60),
        ).slice(0, max)
      : [];
  let dateStart = pick(isoDate.nullable(), input["dateStart"] ?? null, null);
  let dateEnd = pick(isoDate.nullable(), input["dateEnd"] ?? null, null);
  if (dateStart && dateEnd && dateStart > dateEnd) {
    [dateStart, dateEnd] = [dateEnd, dateStart];
  }
  const city = pick(shortText.nullable(), input["city"] ?? null, null);
  return {
    formats: Array.from(new Set(formats)),
    categories: strList(input["categories"], 10),
    technologies: strList(input["technologies"], 12),
    dateStart,
    dateEnd,
    city,
  };
}

export function hasAnyFilter(f: SearchFilters): boolean {
  return (
    f.formats.length > 0 ||
    f.categories.length > 0 ||
    f.technologies.length > 0 ||
    !!f.dateStart ||
    !!f.dateEnd ||
    !!f.city
  );
}

/** Merge follow-up constraints into previous ones. Non-empty new values win. */
export function mergeFilters(prev: SearchFilters, next: SearchFilters): SearchFilters {
  return {
    formats: next.formats.length ? next.formats : prev.formats,
    categories: next.categories.length ? next.categories : prev.categories,
    technologies: next.technologies.length ? next.technologies : prev.technologies,
    dateStart: next.dateStart ?? prev.dateStart,
    dateEnd: next.dateEnd ?? prev.dateEnd,
    city: next.city ?? prev.city,
  };
}

const lower = (s: string) => s.toLowerCase();

export function eventMatchesFilters(e: EventRecord, f: SearchFilters): boolean {
  if (f.formats.length && !f.formats.includes(e.format)) return false;
  if (f.categories.length && !f.categories.map(lower).includes(lower(e.category))) return false;
  if (f.technologies.length) {
    const wanted = f.technologies.map(lower);
    if (!e.technologies.some((t) => wanted.includes(lower(t)))) return false;
  }
  const day = e.startAt.slice(0, 10);
  if (f.dateStart && day < f.dateStart) return false;
  if (f.dateEnd && day > f.dateEnd) return false;
  if (f.city && lower(e.city ?? "") !== lower(f.city)) return false;
  return true;
}

/** Inclusive UTC bounds for the database query. */
export function filterBounds(f: SearchFilters): { start: string | null; end: string | null } {
  return {
    start: f.dateStart ? `${f.dateStart}T00:00:00Z` : null,
    end: f.dateEnd ? `${f.dateEnd}T23:59:59.999Z` : null,
  };
}

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function describeFilters(f: SearchFilters): string[] {
  const out: string[] = [];
  if (f.formats.length) out.push(`Format: ${f.formats.map((x) => FORMAT_LABELS[x]).join(" or ")}`);
  if (f.categories.length) out.push(`Category: ${f.categories.join(", ")}`);
  if (f.technologies.length) out.push(`Technology: ${f.technologies.join(", ")}`);
  if (f.dateStart && f.dateEnd) out.push(`Dates: ${fmtDay(f.dateStart)} – ${fmtDay(f.dateEnd)}`);
  else if (f.dateStart) out.push(`From ${fmtDay(f.dateStart)}`);
  else if (f.dateEnd) out.push(`Until ${fmtDay(f.dateEnd)}`);
  if (f.city) out.push(`City: ${f.city}`);
  return out;
}

export { EMPTY_FILTERS };
