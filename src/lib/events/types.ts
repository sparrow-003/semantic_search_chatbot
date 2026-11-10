// Client-safe shared types for event search, ranking and the chat workspace.

export const EVENT_FORMATS = ["online", "in_person", "hybrid"] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export const FORMAT_LABELS: Record<EventFormat, string> = {
  online: "Online",
  in_person: "In person",
  hybrid: "Hybrid",
};

export const SEARCH_MODES = ["hybrid", "semantic", "keyword"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export interface EventRecord {
  id: string;
  tenantId: string | null;
  title: string;
  summary: string;
  description: string;
  category: string;
  format: EventFormat;
  startAt: string;
  endAt: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  registrationUrl: string | null;
  technologies: string[];
  audience: string[];
  isFree: boolean;
}

export interface SearchFilters {
  formats: EventFormat[];
  categories: string[];
  technologies: string[];
  dateStart: string | null; // YYYY-MM-DD (inclusive)
  dateEnd: string | null; // YYYY-MM-DD (inclusive)
  city: string | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  formats: [],
  categories: [],
  technologies: [],
  dateStart: null,
  dateEnd: null,
  city: null,
};

export interface MatchExplanation {
  matchedTerms: string[];
  matchedTechnologies: string[];
  matchedFields: string[];
  appliedFilters: string[];
  summary: string;
}

export interface RankedEvent extends EventRecord {
  score: number;
  semanticScore: number;
  keywordScore: number;
  metadataScore: number;
  explanation: MatchExplanation;
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  filters: SearchFilters;
  results: RankedEvent[];
  totalCandidates: number;
  lowConfidence: boolean;
  semanticAvailable: boolean;
  latencyMs: number;
}

export interface Facets {
  categories: string[];
  cities: string[];
  technologies: string[];
  total: number;
}

/** Explicit conversation state: never rely on model memory alone. */
export interface ConversationContext {
  query: string;
  searchText: string;
  filters: SearchFilters;
  resultIds: string[];
  intent: string;
  at: string;
}
