import { describe, expect, it } from "vitest";
import {
  buildTsQuery,
  embeddingDocument,
  explainMatch,
  metadataScore,
  normalizeSemantic,
  rankCandidates,
  tokenize,
  type Candidate,
} from "@/lib/events/ranking";
import { EMPTY_FILTERS } from "@/lib/events/types";

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: null,
    title: "React Summit Online: Server Components in Practice",
    summary: "A full day on React Server Components and Next.js streaming.",
    description: "Talks and live demos on React Server Components, App Router, and TypeScript.",
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
    semanticRaw: 0.78,
    keywordRaw: 0.9,
    ...overrides,
  };
}

describe("ranking and search explanations", () => {
  it("tokenizes queries while keeping compound tech names and removing stopwords", () => {
    const tokens = tokenize("Find all online React and Next.js events next month");
    expect(tokens).toContain("react");
    expect(tokens).toContain("next.js");
    expect(tokens).not.toContain("find");
    expect(tokens).not.toContain("events");
  });

  it("builds safe OR-tsqueries and strips tsquery operator injection", () => {
    const tsq = buildTsQuery(tokenize("react | (foo & !bar); drop table"));
    expect(tsq).not.toContain("!");
    expect(tsq).not.toContain(";");
    expect(tsq).toContain("react:*");
  });

  it("calibrates semantic similarity across floor..ceil", () => {
    expect(normalizeSemantic(0)).toBe(0);
    expect(normalizeSemantic(0.5)).toBe(0);
    expect(normalizeSemantic(0.65)).toBeCloseTo(0.5, 4);
    expect(normalizeSemantic(0.95)).toBe(1);
  });

  it("computes metadata alignment accurately", () => {
    const ev = makeCandidate();
    expect(metadataScore(ev, ["React", "Next.js"])).toBe(1);
    expect(metadataScore(ev, ["React", "Kubernetes"])).toBe(0.5);
    expect(metadataScore(ev, [])).toBe(0.5);
  });

  it("produces evidence-backed match explanations without fabricating fields", () => {
    const ev = makeCandidate();
    const exp = explainMatch(
      ev,
      ["react", "streaming"],
      ["React"],
      {
        ...EMPTY_FILTERS,
        formats: ["online"],
      },
      0.78,
    );
    expect(exp.matchedTechnologies).toContain("React");
    expect(exp.matchedTerms).toContain("streaming");
    expect(exp.summary).toContain("React");
    expect(exp.summary).toContain("online");
  });

  it("ranks stronger hybrid matches ahead of weak/unrelated ones and flags low confidence", () => {
    const strong = makeCandidate();
    const weak = makeCandidate({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Kubernetes Security Webinar",
      summary: "Hardening cluster policies.",
      description: "Admission controllers and pod security.",
      technologies: ["Kubernetes", "Security"],
      semanticRaw: 0.42,
      keywordRaw: 0,
    });

    const res = rankCandidates({
      candidates: [weak, strong],
      queryText: "React Next.js",
      signals: ["React", "Next.js"],
      filters: EMPTY_FILTERS,
      mode: "hybrid",
      limit: 10,
    });
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.id).toBe(strong.id);
    expect(res.lowConfidence).toBe(false);

    const empty = rankCandidates({
      candidates: [weak],
      queryText: "Quantum Basket Weaving",
      signals: [],
      filters: EMPTY_FILTERS,
      mode: "hybrid",
      limit: 10,
    });
    expect(empty.results).toHaveLength(0);
    expect(empty.lowConfidence).toBe(true);
  });

  it("formats deterministic embedding documents", () => {
    const doc = embeddingDocument(makeCandidate());
    expect(doc).toContain("Title: React Summit Online");
    expect(doc).toContain("Technologies: React, Next.js, TypeScript");
  });
});
