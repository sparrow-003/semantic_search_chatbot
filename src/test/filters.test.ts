import { describe, expect, it } from "vitest";
import {
  describeFilters,
  eventMatchesFilters,
  filterBounds,
  mergeFilters,
  sanitizeFilters,
} from "@/lib/events/filters";
import { EMPTY_FILTERS, type EventRecord } from "@/lib/events/types";

const sampleEvent: EventRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: null,
  title: "Next.js Performance Clinic",
  summary: "Profile and optimize Next.js storefronts.",
  description: "Hands-on Core Web Vitals optimization.",
  category: "Workshop",
  format: "online",
  startAt: "2026-12-08T17:00:00Z",
  endAt: "2026-12-08T20:00:00Z",
  venue: "Zoom",
  city: null,
  country: null,
  registrationUrl: "https://events.example.com/nextjs",
  technologies: ["Next.js", "React"],
  audience: ["Frontend developers"],
  isFree: false,
};

describe("filters validation and strict matching", () => {
  it("sanitizes invalid inputs and swaps reversed date ranges", () => {
    const clean = sanitizeFilters({
      formats: ["online", "bogus_format"],
      categories: ["Workshop", "workshop", "  "],
      technologies: ["React", "react", "Next.js"],
      dateStart: "2026-12-31",
      dateEnd: "2026-12-01",
      city: "  ",
    });
    expect(clean.formats).toEqual(["online"]);
    expect(clean.categories).toEqual(["Workshop"]);
    expect(clean.technologies).toEqual(["React", "Next.js"]);
    expect(clean.dateStart).toBe("2026-12-01");
    expect(clean.dateEnd).toBe("2026-12-31");
    expect(clean.city).toBeNull();
  });

  it("enforces strict format, date, category, technology, and city predicates", () => {
    expect(
      eventMatchesFilters(sampleEvent, {
        ...EMPTY_FILTERS,
        formats: ["online"],
        dateStart: "2026-12-01",
        dateEnd: "2026-12-31",
        technologies: ["react"],
      }),
    ).toBe(true);

    expect(
      eventMatchesFilters(sampleEvent, {
        ...EMPTY_FILTERS,
        formats: ["in_person"],
      }),
    ).toBe(false);

    expect(
      eventMatchesFilters(sampleEvent, {
        ...EMPTY_FILTERS,
        dateStart: "2027-01-01",
      }),
    ).toBe(false);
  });

  it("merges follow-up filters cleanly and builds UTC bounds", () => {
    const merged = mergeFilters(
      { ...EMPTY_FILTERS, technologies: ["React"], dateStart: "2026-12-01", dateEnd: "2026-12-31" },
      { ...EMPTY_FILTERS, formats: ["online"] },
    );
    expect(merged.technologies).toEqual(["React"]);
    expect(merged.formats).toEqual(["online"]);
    expect(filterBounds(merged)).toEqual({
      start: "2026-12-01T00:00:00Z",
      end: "2026-12-31T23:59:59.999Z",
    });
    expect(describeFilters(merged).length).toBeGreaterThanOrEqual(3);
  });
});
