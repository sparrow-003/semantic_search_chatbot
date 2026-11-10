import { describe, expect, it } from "vitest";
import { parseUserIntent } from "@/lib/ai/intent-parser";
import { buildDeterministicGroundedSummary, composeUIResponse } from "@/lib/ai/ui-composer";
import type { Facets, RankedEvent } from "@/lib/events/types";
import { validateUISpec } from "@/lib/ui/validator";
import { stripFilterTokensFromQuery } from "@/lib/server/search.server";
import { assertWorkspaceAccess, isValidUuid } from "@/lib/server/supabase.server";

const SAMPLE_FACETS: Facets = {
  categories: ["Conference", "Workshop", "Meetup", "Webinar"],
  cities: ["Berlin", "London", "New York"],
  technologies: ["React", "Next.js", "TypeScript", "AI", "LLM"],
  total: 48,
};

const SAMPLE_EVENTS: RankedEvent[] = [
  {
    id: "c5dcebf5-1d54-4ad1-9ba4-32b1d91bb011",
    tenantId: null,
    title: "React Summit Online: Server Components in Practice",
    summary: "React Server Components and streaming.",
    description: "Deep dive on RSC and Next.js App Router.",
    category: "Conference",
    format: "online",
    startAt: "2026-12-03T15:00:00Z",
    endAt: "2026-12-03T21:00:00Z",
    venue: "Virtual stage",
    city: null,
    country: null,
    registrationUrl: "https://events.example.com/react-summit",
    technologies: ["React", "Next.js", "TypeScript"],
    audience: ["Frontend developers"],
    isFree: false,
    score: 0.91,
    semanticScore: 0.85,
    keywordScore: 0.95,
    metadataScore: 1,
    explanation: {
      matchedTerms: ["react", "next.js"],
      matchedTechnologies: ["React", "Next.js"],
      matchedFields: ["title", "technologies"],
      appliedFilters: ["Format: Online"],
      summary: "Matched because it lists React and Next.js among its technologies; it is online.",
    },
  },
  {
    id: "f2f404ce-a937-4ac4-8706-8077cb797fee",
    tenantId: null,
    title: "Next.js Performance Clinic",
    summary: "Hands-on workshop to speed up Next.js.",
    description: "Profile Core Web Vitals on Next.js.",
    category: "Workshop",
    format: "online",
    startAt: "2026-12-08T17:00:00Z",
    endAt: "2026-12-08T20:00:00Z",
    venue: "Zoom",
    city: null,
    country: null,
    registrationUrl: "https://events.example.com/nextjs-clinic",
    technologies: ["Next.js", "React"],
    audience: ["Frontend developers"],
    isFree: true,
    score: 0.86,
    semanticScore: 0.8,
    keywordScore: 0.88,
    metadataScore: 1,
    explanation: {
      matchedTerms: ["next.js"],
      matchedTechnologies: ["Next.js", "React"],
      matchedFields: ["title", "technologies"],
      appliedFilters: ["Format: Online"],
      summary: "Matched because it lists Next.js and React among its technologies; it is online.",
    },
  },
];

describe("PRD End-to-End orchestration scenarios", () => {
  const NOV_2026 = new Date("2026-11-10T12:00:00Z");

  it("Scenario 1: Searches for React events and composes grounded event cards", () => {
    const query = "Find online React events";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: SAMPLE_EVENTS, facets: SAMPLE_FACETS });
    expect(validateUISpec(ui).ok).toBe(true);
    expect(ui.components.some((c) => c.type === "event_cards")).toBe(true);

    const summary = buildDeterministicGroundedSummary(query, parsed, SAMPLE_EVENTS, true, false);
    expect(summary).toContain("React Summit Online");
    expect(summary).toContain("2");
  });

  it("Scenario 2: Generates a comparison table when asked to compare", () => {
    const query = "Compare these React events by date";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: SAMPLE_EVENTS, facets: SAMPLE_FACETS });
    expect(validateUISpec(ui).ok).toBe(true);
    expect(ui.components.some((c) => c.type === "comparison_table")).toBe(true);
  });

  it("Scenario 3: Generates a chart computed strictly from retrieved records", () => {
    const query = "Show event distribution by category as a bar chart";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: SAMPLE_EVENTS, facets: SAMPLE_FACETS });
    const chart = ui.components.find((c) => c.type === "chart");
    expect(chart?.type).toBe("chart");
    if (chart?.type === "chart") {
      expect(chart.props.data).toEqual([
        { label: "Conference", value: 1 },
        { label: "Workshop", value: 1 },
      ]);
    }
  });

  it("Scenario 4: Generates a valid flowchart diagram", () => {
    const query = "Show how semantic search works";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: [], facets: SAMPLE_FACETS });
    expect(validateUISpec(ui).ok).toBe(true);
    const diag = ui.components.find((c) => c.type === "diagram");
    expect(diag?.type).toBe("diagram");
  });

  it("Scenario 5: Generates a dynamic event filter form populated with live facets", () => {
    const query = "Create a form to filter events";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: [], facets: SAMPLE_FACETS });
    expect(validateUISpec(ui).ok).toBe(true);
    const form = ui.components.find((c) => c.type === "dynamic_form");
    expect(form?.type).toBe("dynamic_form");
    if (form?.type === "dynamic_form") {
      expect(form.props.action).toBe("filter_search");
    }
  });

  it("Scenario 6: Generates a composite dashboard + comparison for the PRD 1.2 prompt", () => {
    const query =
      "Find all online React and Next.js events next month, compare them by date and category, and show me an analytics dashboard.";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: SAMPLE_EVENTS, facets: SAMPLE_FACETS });
    expect(validateUISpec(ui).ok).toBe(true);
    expect(ui.components.some((c) => c.type === "dashboard")).toBe(true);
    expect(ui.components.some((c) => c.type === "comparison_table")).toBe(true);
  });

  it("Scenario 7: Handles unrelated / zero results cleanly without fabricating events", () => {
    const query = "Find underwater basket weaving events in Antarctica";
    const parsed = parseUserIntent(query, null, NOV_2026);
    const ui = composeUIResponse({ query, parsed, events: [], facets: SAMPLE_FACETS });
    expect(validateUISpec(ui).ok).toBe(true);
    expect(ui.components.some((c) => c.type === "dynamic_form")).toBe(true);
    const msg = buildDeterministicGroundedSummary(query, parsed, [], false, true);
    expect(msg).toContain("No matching events were found");
  });

  it("Scenario 8: Denies cross-tenant / invalid workspace access server-side", async () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(
      assertWorkspaceAccess(
        mockClient as never,
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toThrow(/do not have access/i);
  });

  it("Strips already-filtered constraint words from full-text keyword queries", () => {
    const stripped = stripFilterTokensFromQuery("Show all online events in December", {
      formats: ["online"],
      categories: [],
      technologies: [],
      dateStart: "2026-12-01",
      dateEnd: "2026-12-31",
      city: null,
    });
    expect(stripped).toBe("");
  });
});
