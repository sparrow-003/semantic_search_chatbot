import { describeFilters } from "./filters";
import {
  FORMAT_LABELS,
  type EventRecord,
  type MatchExplanation,
  type RankedEvent,
  type SearchFilters,
  type SearchMode,
} from "./types";

/** Configurable ranking weights per search mode. Evaluated against src/test queries. */
export const RANKING_WEIGHTS: Record<SearchMode, { semantic: number; keyword: number; metadata: number }> = {
  hybrid: { semantic: 0.5, keyword: 0.3, metadata: 0.2 },
  semantic: { semantic: 0.8, keyword: 0, metadata: 0.2 },
  keyword: { semantic: 0, keyword: 0.8, metadata: 0.2 },
};

/** Cosine similarity calibration for the embedding model (raw similarity -> 0..1). */
export const SEMANTIC_FLOOR = 0.5;
export const SEMANTIC_CEIL = 0.8;
/** Below this raw similarity with no keyword overlap, a result is not considered relevant. */
export const SEMANTIC_MIN_RELEVANT = 0.56;
export const MIN_FINAL_SCORE = 0.18;

const STOPWORDS = new Set(
  (
    "a an and are as at be but by can do does for from find get give has have i in into is it its me " +
    "my near next of on or our please show so some that the their them these this those to up us want " +
    "was we what when where which who will with you your all any about also events event list look " +
    "looking month week year today tomorrow upcoming new latest compare comparison chart dashboard " +
    "table create build make than then only just more most like"
  ).split(" "),
);

/** Tokenize query text into lowercase searchable terms (keeps tokens like next.js / c#). */
export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9.+#-]+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(raw)).slice(0, 24);
}

/**
 * Build a safe OR-tsquery from tokens. Every lexeme is reduced to [a-z0-9]
 * segments so user input can never inject tsquery operators.
 */
export function buildTsQuery(tokens: string[]): string {
  const parts: string[] = [];
  for (const tok of tokens) {
    const segs = tok.split(/[^a-z0-9]+/).filter((s) => s.length >= 2 || /\d/.test(s));
    if (!segs.length) continue;
    parts.push(segs.length === 1 ? `${segs[0]}:*` : `(${segs.join(" & ")})`);
  }
  return Array.from(new Set(parts)).slice(0, 20).join(" | ");
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function normalizeSemantic(sim: number): number {
  if (sim <= 0) return 0;
  return clamp01((sim - SEMANTIC_FLOOR) / (SEMANTIC_CEIL - SEMANTIC_FLOOR));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function termInText(term: string, text: string): boolean {
  const t = norm(term);
  if (!t) return false;
  return norm(text).includes(t);
}

export interface Candidate extends EventRecord {
  semanticRaw: number;
  keywordRaw: number;
}

export interface RankInput {
  candidates: Candidate[];
  queryText: string;
  signals: string[]; // technologies / topics extracted from the request
  filters: SearchFilters;
  mode: SearchMode;
  limit: number;
}

export function explainMatch(
  e: EventRecord,
  tokens: string[],
  signals: string[],
  filters: SearchFilters,
  semanticRaw: number,
): MatchExplanation {
  const fields: Array<[string, string]> = [
    ["title", e.title],
    ["technologies", e.technologies.join(" ")],
    ["category", e.category],
    ["summary", e.summary],
    ["description", e.description],
    ["audience", e.audience.join(" ")],
    ["location", `${e.city ?? ""} ${e.venue ?? ""} ${e.country ?? ""}`],
  ];
  const matchedTerms: string[] = [];
  const matchedFields = new Set<string>();
  for (const tok of tokens) {
    let hit = false;
    for (const [name, text] of fields) {
      if (termInText(tok, text)) {
        matchedFields.add(name);
        hit = true;
      }
    }
    if (hit) matchedTerms.push(tok);
  }
  const wanted = [...signals, ...tokens].map(norm).filter(Boolean);
  const matchedTechnologies = e.technologies.filter((t) => {
    const nt = norm(t);
    return wanted.some((w) => w === nt || (w.length >= 3 && (nt.includes(w) || w.includes(nt))));
  });

  const appliedFilters = describeFilters(filters);

  // Deterministic, evidence-backed explanation. Never claims anything not in the record.
  const reasons: string[] = [];
  if (matchedTechnologies.length) {
    reasons.push(`it lists ${joinNice(matchedTechnologies)} among its technologies`);
  }
  const textFields = Array.from(matchedFields).filter((f) => f !== "technologies");
  if (matchedTerms.length && textFields.length) {
    reasons.push(
      `the ${joinNice(textFields.slice(0, 3))} mention${textFields.length === 1 ? "s" : ""} ${joinNice(
        matchedTerms.slice(0, 4).map((t) => `“${t}”`),
      )}`,
    );
  }
  if (!reasons.length && semanticRaw >= SEMANTIC_MIN_RELEVANT) {
    reasons.push(`its description is semantically close to your request (similarity ${semanticRaw.toFixed(2)})`);
  }
  const filterBits: string[] = [];
  if (filters.formats.length) filterBits.push(`it is ${FORMAT_LABELS[e.format].toLowerCase()}`);
  if (filters.dateStart || filters.dateEnd) filterBits.push("its date is inside your range");
  if (filters.categories.length) filterBits.push(`it is a ${e.category.toLowerCase()}`);
  if (filters.city && e.city) filterBits.push(`it takes place in ${e.city}`);

  let summary: string;
  if (reasons.length) {
    summary = `Matched because ${reasons.join(" and ")}`;
    if (filterBits.length) summary += `; ${joinNice(filterBits)}`;
    summary += ".";
  } else if (filterBits.length) {
    summary = `Included because ${joinNice(filterBits)}.`;
  } else {
    summary = "Included as part of the browsable event list.";
  }

  return {
    matchedTerms,
    matchedTechnologies,
    matchedFields: Array.from(matchedFields),
    appliedFilters,
    summary,
  };
}

function joinNice(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function metadataScore(e: EventRecord, signals: string[]): number {
  if (!signals.length) return 0.5;
  const hay = norm([e.technologies.join(" "), e.category, e.audience.join(" "), e.title].join(" "));
  const hits = signals.filter((s) => {
    const n = norm(s);
    return n.length > 0 && hay.includes(n);
  }).length;
  return clamp01(hits / signals.length);
}

/** Combine semantic, keyword and metadata signals into a ranked, explained result list. */
export function rankCandidates(input: RankInput): { results: RankedEvent[]; lowConfidence: boolean } {
  const { candidates, queryText, signals, filters, mode, limit } = input;
  const weights = RANKING_WEIGHTS[mode];
  const tokens = tokenize(queryText);
  const hasQuery = tokens.length > 0 || signals.length > 0;
  const maxKw = Math.max(0, ...candidates.map((c) => c.keywordRaw));

  const scored: RankedEvent[] = candidates.map((c) => {
    const semanticScore = normalizeSemantic(c.semanticRaw);
    const keywordScore = maxKw > 0 ? clamp01(c.keywordRaw / maxKw) : 0;
    const meta = metadataScore(c, signals);
    const totalW = weights.semantic + weights.keyword + weights.metadata;
    const score = hasQuery
      ? clamp01((weights.semantic * semanticScore + weights.keyword * keywordScore + weights.metadata * meta) / totalW)
      : 1;
    const explanation = explainMatch(c, tokens, signals, filters, c.semanticRaw);
    const { semanticRaw: _s, keywordRaw: _k, ...rest } = c;
    return {
      ...rest,
      score,
      semanticScore,
      keywordScore,
      metadataScore: meta,
      explanation,
    };
  });

  let results = scored;
  if (hasQuery) {
    results = scored.filter((r, i) => {
      const cand = candidates[i]!;
      const lexical = r.explanation.matchedTerms.length > 0 || r.explanation.matchedTechnologies.length > 0;
      const semanticOk = mode !== "keyword" && cand.semanticRaw >= SEMANTIC_MIN_RELEVANT;
      return (lexical || semanticOk) && r.score >= MIN_FINAL_SCORE;
    });
    results.sort((a, b) => b.score - a.score || a.startAt.localeCompare(b.startAt));
  } else {
    results.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  const top = results[0];
  const lowConfidence =
    hasQuery &&
    (!top ||
      (top.explanation.matchedTerms.length === 0 &&
        top.explanation.matchedTechnologies.length === 0 &&
        top.semanticScore < 0.35));

  return { results: results.slice(0, limit), lowConfidence };
}

/** Normalized document used for embeddings. Changing it changes content hashes. */
export function embeddingDocument(e: Pick<
  EventRecord,
  "title" | "summary" | "description" | "category" | "format" | "technologies" | "audience" | "city" | "venue"
>): string {
  return [
    `Title: ${e.title}`,
    `Category: ${e.category}`,
    `Format: ${FORMAT_LABELS[e.format]}`,
    e.technologies.length ? `Technologies: ${e.technologies.join(", ")}` : "",
    e.audience.length ? `Audience: ${e.audience.join(", ")}` : "",
    e.city ? `Location: ${e.city}${e.venue ? `, ${e.venue}` : ""}` : "",
    `Summary: ${e.summary}`,
    `Description: ${e.description}`,
  ]
    .filter(Boolean)
    .join("\n");
}
