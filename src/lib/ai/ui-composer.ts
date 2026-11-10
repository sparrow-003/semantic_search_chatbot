import { computeKpis, DIMENSION_LABELS, groupCount } from "@/lib/events/aggregate";
import { describeFilters } from "@/lib/events/filters";
import type { ConversationContext, Facets, RankedEvent } from "@/lib/events/types";
import type { ParsedIntent } from "./intent-parser";
import type {
  ChartType,
  DashboardConfig,
  DataTableConfig,
  DiagramType,
  UIComponent,
  UIResponse,
} from "@/lib/ui/schema";
import { applyTableCommand, sanitizeExternalUrl, validateUISpec } from "@/lib/ui/validator";

const DEFAULT_TABLE_CONFIG: DataTableConfig = {
  visibleColumns: ["title", "category", "format", "startAt", "location", "technologies", "score"],
  sortBy: "score",
  sortDir: "desc",
  groupBy: "none",
  pageSize: 10,
  density: "comfortable",
};

function toSafeEventItem(e: RankedEvent) {
  return {
    id: e.id,
    tenantId: e.tenantId,
    title: e.title,
    summary: e.summary,
    description: e.description,
    category: e.category,
    format: e.format,
    startAt: e.startAt,
    endAt: e.endAt,
    venue: e.venue,
    city: e.city,
    country: e.country,
    registrationUrl: sanitizeExternalUrl(e.registrationUrl),
    technologies: e.technologies,
    audience: e.audience,
    isFree: e.isFree,
    score: Number(e.score.toFixed(4)),
    semanticScore: Number(e.semanticScore.toFixed(4)),
    keywordScore: Number(e.keywordScore.toFixed(4)),
    metadataScore: Number(e.metadataScore.toFixed(4)),
    explanation: e.explanation,
  };
}

/**
 * Build documented architecture, pipeline, sequence, ER, or mind-map diagrams.
 * Assumptions are explicitly surfaced whenever the diagram includes conceptual layers.
 */
export function buildDocumentedDiagram(
  query: string,
  diagramType: DiagramType,
): Extract<UIComponent, { type: "diagram" }> {
  const lower = query.toLowerCase();

  if (diagramType === "er_diagram" || /\bdatabase|schema|tables?|er\b/.test(lower)) {
    return {
      id: "diagram_schema",
      type: "diagram",
      props: {
        title: "Workspace Database Entity-Relationship Diagram",
        subtitle: "Documented PostgreSQL + pgvector core schema with Row-Level Security",
        diagramType: "er_diagram",
        groundedSource: "drizzle/migrations/0000_workspace_core_schema.sql",
        nodes: [
          { id: "tenants", label: "tenants", description: "Workspace boundary & owner", kind: "storage", layer: 0 },
          { id: "tenant_members", label: "tenant_members", description: "RBAC roles: owner..viewer", kind: "storage", layer: 1 },
          { id: "events", label: "events", description: "Events + search_tsv FTS + index_status", kind: "storage", layer: 1 },
          { id: "event_embeddings", label: "event_embeddings", description: "pgvector(768) HNSW cosine index", kind: "storage", layer: 2 },
          { id: "chat_sessions", label: "chat_sessions", description: "Per-user session metadata", kind: "storage", layer: 1 },
          { id: "chat_messages", label: "chat_messages", description: "Messages + UI parts + Context JSONB", kind: "storage", layer: 2 },
          { id: "saved_dashboards", label: "saved_dashboards", description: "Private or workspace-shared layouts", kind: "storage", layer: 1 },
          { id: "audit_logs", label: "audit_logs", description: "Append-only security audit trail", kind: "service", layer: 2 },
        ],
        edges: [
          { id: "e1", source: "tenants", target: "tenant_members", label: "1:N membership" },
          { id: "e2", source: "tenants", target: "events", label: "1:N tenant scope" },
          { id: "e3", source: "events", target: "event_embeddings", label: "1:1 vector(768)" },
          { id: "e4", source: "tenants", target: "chat_sessions", label: "optional scope" },
          { id: "e5", source: "chat_sessions", target: "chat_messages", label: "1:N history" },
          { id: "e6", source: "tenants", target: "saved_dashboards", label: "1:N dashboards" },
          { id: "e7", source: "tenants", target: "audit_logs", label: "1:N triggers" },
        ],
        mermaidCode: [
          "erDiagram",
          "  TENANTS ||--o{ TENANT_MEMBERS : has",
          "  TENANTS ||--o{ EVENTS : scopes",
          "  EVENTS ||--|| EVENT_EMBEDDINGS : embeds",
          "  TENANTS ||--o{ CHAT_SESSIONS : owns",
          "  CHAT_SESSIONS ||--o{ CHAT_MESSAGES : stores",
          "  TENANTS ||--o{ SAVED_DASHBOARDS : shares",
          "  TENANTS ||--o{ AUDIT_LOGS : records",
        ].join("\n"),
      },
    };
  }

  if (diagramType === "sequence" || /\bsequence\b/.test(lower)) {
    return {
      id: "diagram_sequence",
      type: "diagram",
      props: {
        title: "Grounded Search & Dynamic UI Sequence",
        subtitle: "End-to-end request lifecycle from user prompt to validated UI components",
        diagramType: "sequence",
        groundedSource: "PRD Section 11 — AI Orchestration Architecture",
        nodes: [
          { id: "user", label: "User Workspace", kind: "actor", layer: 0 },
          { id: "api", label: "API Gateway & Auth", kind: "service", layer: 1 },
          { id: "orchestrator", label: "AI Orchestrator", kind: "process", layer: 2 },
          { id: "db", label: "PostgreSQL + pgvector", kind: "storage", layer: 3 },
          { id: "llm", label: "AI Gateway (LLM + Embeddings)", kind: "service", layer: 3 },
          { id: "validator", label: "Zod UI Validator", kind: "decision", layer: 4 },
        ],
        edges: [
          { id: "s1", source: "user", target: "api", label: "1. Query + Bearer JWT", animated: true },
          { id: "s2", source: "api", target: "orchestrator", label: "2. Sanitized request + Tenant check" },
          { id: "s3", source: "orchestrator", target: "llm", label: "3. Intent + 768d query vector" },
          { id: "s4", source: "orchestrator", target: "db", label: "4. search_events RPC (RLS)" },
          { id: "s5", source: "db", target: "orchestrator", label: "5. Authorized candidate rows" },
          { id: "s6", source: "orchestrator", target: "validator", label: "6. Validate UIResponse schema" },
          { id: "s7", source: "validator", target: "user", label: "7. Stream grounded UI", animated: true },
        ],
        mermaidCode: [
          "sequenceDiagram",
          "  participant U as User Workspace",
          "  participant A as API & Auth Guard",
          "  participant O as AI Orchestrator",
          "  participant G as AI Gateway",
          "  participant D as Postgres + pgvector",
          "  participant V as UI Schema Validator",
          "  U->>A: POST /api/v1/chat (query + JWT)",
          "  A->>O: Verified userId & workspaceId",
          "  O->>G: Extract intent & 768d embedding",
          "  O->>D: search_events(vec, tsv, filters)",
          "  D-->>O: Scoped authorized records",
          "  O->>V: Validate declarative UIResponse",
          "  V-->>U: Stream grounded answer + safe UI",
        ].join("\n"),
      },
    };
  }

  if (diagramType === "architecture" || /\barchitecture|system\b/.test(lower)) {
    return {
      id: "diagram_arch",
      type: "diagram",
      props: {
        title: "Scout Semantic Search & Dynamic AI Workspace Architecture",
        subtitle: "Layered TanStack Start, API Gateway, AI Orchestration, and PostgreSQL + pgvector",
        diagramType: "architecture",
        groundedSource: "PRD Section 12 — Technical Architecture & TanStack Start Runtime",
        assumptions: [
          "Semantic vectors require LOVABLE_API_KEY and indexed event_embeddings; keyword + metadata filters remain active as fallback.",
        ],
        nodes: [
          { id: "ui", label: "Workspace UI & Component Registry", description: "React + Tailwind + Recharts + React Flow", kind: "input", layer: 0 },
          { id: "api", label: "TanStack Start API Routes (/api/v1/*)", description: "Zod input validation & rate limits", kind: "service", layer: 1 },
          { id: "auth", label: "Auth & Tenant Guard", description: "Supabase JWT + RBAC + RLS", kind: "decision", layer: 1 },
          { id: "orch", label: "AI Orchestrator", description: "Intent router, context & prompt guard", kind: "process", layer: 2 },
          { id: "search", label: "Hybrid Search & Ranking", description: "0.50 Semantic + 0.30 FTS + 0.20 Metadata", kind: "process", layer: 3 },
          { id: "analytics", label: "Deterministic Analytics Engine", description: "KPIs & groupCount over authorized rows", kind: "process", layer: 3 },
          { id: "uiengine", label: "UI Composer & Validator", description: "Strict Zod allowlist, no arbitrary HTML/JS", kind: "output", layer: 3 },
          { id: "pg", label: "PostgreSQL + pgvector + RLS", description: "events, event_embeddings, chat_sessions, dashboards", kind: "storage", layer: 4 },
          { id: "gw", label: "Lovable AI Gateway", description: "Gemini / OpenAI chat & gemini-embedding-001", kind: "service", layer: 4 },
        ],
        edges: [
          { id: "a1", source: "ui", target: "api", label: "HTTPS / SSE", animated: true },
          { id: "a2", source: "api", target: "auth", label: "Verify token" },
          { id: "a3", source: "auth", target: "orch", label: "Authorized context" },
          { id: "a4", source: "orch", target: "search", label: "Retrieve" },
          { id: "a5", source: "orch", target: "analytics", label: "Aggregate" },
          { id: "a6", source: "orch", target: "uiengine", label: "Compose UI" },
          { id: "a7", source: "search", target: "pg", label: "HNSW + GIN FTS" },
          { id: "a8", source: "orch", target: "gw", label: "Structured LLM + Embeddings" },
          { id: "a9", source: "uiengine", target: "ui", label: "Validated JSON spec", animated: true },
        ],
        mermaidCode: [
          "flowchart TD",
          '  UI["Workspace UI & Component Registry"] -->|HTTPS / SSE| API["API Routes (/api/v1/*)"]',
          '  API --> AUTH["Supabase Auth & Tenant Guard"]',
          '  AUTH --> ORCH["AI Orchestration Layer"]',
          '  ORCH --> SEARCH["Hybrid Search & Ranking"]',
          '  ORCH --> ANALYTICS["Deterministic Analytics Engine"]',
          '  ORCH --> UIENG["UI Composer & Zod Validator"]',
          '  SEARCH --> PG["PostgreSQL + pgvector + RLS"]',
          '  ORCH --> GW["Lovable AI Gateway (LLM + Embeddings)"]',
          '  UIENG -->|Validated JSON Spec| UI',
        ].join("\n"),
      },
    };
  }

  if (diagramType === "mind_map") {
    return {
      id: "diagram_mindmap",
      type: "diagram",
      props: {
        title: "Intelligent Workspace Capability Mind Map",
        subtitle: "Core modules connecting semantic retrieval, grounding, and dynamic UI",
        diagramType: "mind_map",
        groundedSource: "PRD Section 6 — Product Modules",
        nodes: [
          { id: "root", label: "Scout AI Workspace", kind: "input", layer: 0 },
          { id: "search", label: "Hybrid Semantic Search", kind: "process", layer: 1 },
          { id: "ui", label: "Dynamic UI Engine", kind: "output", layer: 1 },
          { id: "ctx", label: "Conversation Context", kind: "storage", layer: 1 },
          { id: "sec", label: "Security & Multi-Tenancy", kind: "decision", layer: 1 },
          { id: "vec", label: "pgvector + FTS + Metadata", kind: "storage", layer: 2 },
          { id: "viz", label: "Cards, Tables, Charts, Dashboards", kind: "output", layer: 2 },
          { id: "diag", label: "Flowcharts, Architecture & Forms", kind: "output", layer: 2 },
        ],
        edges: [
          { id: "m1", source: "root", target: "search" },
          { id: "m2", source: "root", target: "ui" },
          { id: "m3", source: "root", target: "ctx" },
          { id: "m4", source: "root", target: "sec" },
          { id: "m5", source: "search", target: "vec" },
          { id: "m6", source: "ui", target: "viz" },
          { id: "m7", source: "ui", target: "diag" },
        ],
        mermaidCode: [
          "mindmap",
          "  root((Scout AI Workspace))",
          "    Hybrid Semantic Search",
          "      pgvector HNSW",
          "      PostgreSQL FTS",
          "      Metadata Validation",
          "    Dynamic UI Engine",
          "      Cards & Tables",
          "      Charts & Dashboards",
          "      Diagrams & Forms",
          "    Security & Isolation",
          "      Row-Level Security",
          "      Zod Schema Allowlist",
          "      Prompt Injection Guard",
        ].join("\n"),
      },
    };
  }

  // Default: Semantic Search Process Flowchart
  return {
    id: "diagram_semantic_flow",
    type: "diagram",
    props: {
      title: "How Hybrid Semantic Search & Grounding Works",
      subtitle: "Step-by-step retrieval, metadata validation, ranking, and explanation pipeline",
      diagramType: diagramType === "process" ? "process" : "flowchart",
      groundedSource: "PRD Section 7.5 — Hybrid Retrieval Pipeline",
      nodes: [
        { id: "q", label: "User Query", description: "Natural language + conversation context", kind: "input", layer: 0 },
        { id: "val", label: "Query Validation & Prompt Guard", description: "Sanitize length and detect injection", kind: "decision", layer: 1 },
        { id: "intent", label: "Intent & Constraint Extraction", description: "Extract topics, format, dates, city", kind: "process", layer: 2 },
        { id: "vec", label: "Vector Search (pgvector 768d)", description: "Cosine similarity over event_embeddings", kind: "storage", layer: 3 },
        { id: "kw", label: "Full-Text Keyword Search", description: "Weighted GIN tsvector ranking", kind: "storage", layer: 3 },
        { id: "meta", label: "Strict Metadata Filtering", description: "Enforce tenant RLS, dates, format, category", kind: "decision", layer: 4 },
        { id: "rank", label: "Configurable Hybrid Ranking", description: "0.50 Semantic + 0.30 Keyword + 0.20 Metadata", kind: "process", layer: 5 },
        { id: "out", label: "Grounded Explanations & UI", description: "Cite verified records & validated specs", kind: "output", layer: 6 },
      ],
      edges: [
        { id: "f1", source: "q", target: "val", animated: true },
        { id: "f2", source: "val", target: "intent" },
        { id: "f3", source: "intent", target: "vec", label: "Query embedding" },
        { id: "f4", source: "intent", target: "kw", label: "Safe OR-tsquery" },
        { id: "f5", source: "vec", target: "meta", label: "Candidate IDs" },
        { id: "f6", source: "kw", target: "meta", label: "Candidate IDs" },
        { id: "f7", source: "meta", target: "rank", label: "Verified matches" },
        { id: "f8", source: "rank", target: "out", label: "Evidence + UI", animated: true },
      ],
      mermaidCode: [
        "flowchart TD",
        '  Q["User Query"] --> VAL["Query Validation & Prompt Guard"]',
        '  VAL --> INT["Intent & Constraint Extraction"]',
        '  INT -->|Query Embedding| VEC["Vector Search (pgvector 768d)"]',
        '  INT -->|Safe OR-tsquery| KW["Keyword Search (search_tsv)"]',
        '  VEC --> META["Strict Metadata & Tenant Filtering"]',
        '  KW --> META',
        '  META --> RANK["Hybrid Ranking (0.50 Sem + 0.30 KW + 0.20 Meta)"]',
        '  RANK --> OUT["Grounded Answer, Explanations & Validated UI"]',
      ].join("\n"),
    },
  };
}

/**
 * Build an interactive, schema-validated filter form populated with live facets
 * from the user's authorized event catalog.
 */
export function buildFilterFormComponent(
  facets: Facets,
  currentFilters: ParsedIntent["filters"],
): Extract<UIComponent, { type: "dynamic_form" }> {
  return {
    id: "form_event_filter",
    type: "dynamic_form",
    props: {
      title: "Interactive Event Filter & Search Builder",
      description: "Refine your search using validated facets from your authorized event workspace.",
      action: "filter_search",
      submitLabel: "Search Matching Events",
      multiStep: false,
      fields: [
        {
          name: "query",
          label: "Keywords or Topic",
          type: "text",
          placeholder: "e.g., server components, AI agents, observability",
          helpText: "Leave empty to browse all matching events by filter.",
          maxLength: 200,
        },
        {
          name: "technologies",
          label: "Technologies",
          type: "multi_select",
          defaultValue: currentFilters.technologies,
          options: facets.technologies.slice(0, 40).map((t) => ({ label: t, value: t })),
          helpText: "Select one or more technologies.",
        },
        {
          name: "categories",
          label: "Category",
          type: "multi_select",
          defaultValue: currentFilters.categories,
          options: facets.categories.map((c) => ({ label: c, value: c })),
        },
        {
          name: "formats",
          label: "Event Format",
          type: "multi_select",
          defaultValue: currentFilters.formats,
          options: [
            { label: "Online", value: "online" },
            { label: "In person", value: "in_person" },
            { label: "Hybrid", value: "hybrid" },
          ],
        },
        {
          name: "city",
          label: "City",
          type: "searchable_select",
          defaultValue: currentFilters.city ?? "__any__",
          options: [{ label: "Any city", value: "__any__" }, ...facets.cities.map((c) => ({ label: c, value: c }))],
          dependsOn: { field: "formats", operator: "not_equals", value: "online" },
        },
        {
          name: "dateStart",
          label: "Start Date (from)",
          type: "date",
          defaultValue: currentFilters.dateStart ?? "",
        },
        {
          name: "dateEnd",
          label: "End Date (until)",
          type: "date",
          defaultValue: currentFilters.dateEnd ?? "",
        },
        {
          name: "freeOnly",
          label: "Free events only",
          type: "checkbox",
          defaultValue: false,
        },
      ],
    },
  };
}

function makeKpiComponent(events: RankedEvent[], title?: string): Extract<UIComponent, { type: "kpi_cards" }> {
  const kpis = computeKpis(events);
  return {
    id: "kpi_summary",
    type: "kpi_cards",
    props: {
      ...(title ? { title } : {}),
      metrics: [
        { id: "total", label: "Matching Events", value: kpis.total, accent: "primary" },
        { id: "online", label: "Online", value: kpis.online, accent: "emerald" },
        { id: "in_person", label: "In Person", value: kpis.inPerson, accent: "violet" },
        { id: "free", label: "Free Entry", value: kpis.free, accent: "amber" },
      ],
    },
  };
}

function makeChartComponent(
  events: RankedEvent[],
  chartType: ChartType,
  dimension: ParsedIntent["requestedDimension"],
  id = "chart_primary",
): Extract<UIComponent, { type: "chart" }> {
  const dim = dimension ?? "category";
  const points = groupCount(events, dim, 12);

  // For stacked_bar, compute online vs in_person vs hybrid breakdown per category/month/tech
  const data =
    chartType === "stacked_bar"
      ? points.map((p) => {
          const matching = events.filter((e) => {
            if (dim === "category") return e.category === p.label;
            if (dim === "technology") return e.technologies.includes(p.label);
            if (dim === "city") return (e.city ?? "Online") === p.label;
            return true;
          });
          return {
            label: p.label,
            value: p.value,
            breakdown: {
              Online: matching.filter((e) => e.format === "online").length,
              "In person": matching.filter((e) => e.format === "in_person").length,
              Hybrid: matching.filter((e) => e.format === "hybrid").length,
            },
          };
        })
      : chartType === "scatter"
        ? events.slice(0, 30).map((e) => ({
            label: e.title.slice(0, 32),
            value: Math.round(e.score * 100),
            secondaryValue: e.technologies.length,
          }))
        : points;

  return {
    id,
    type: "chart",
    props: {
      title: `Events by ${DIMENSION_LABELS[dim]}`,
      subtitle: `Aggregated strictly from ${events.length} authorized matching record${events.length === 1 ? "" : "s"}`,
      chartType,
      dimension: dim,
      xLabel: DIMENSION_LABELS[dim],
      yLabel: chartType === "scatter" ? "Relevance %" : "Events",
      ...(chartType === "stacked_bar" ? { seriesKeys: ["Online", "In person", "Hybrid"] } : {}),
      data,
      dataSource: "authorized_search_results",
      provenanceNote: `Computed deterministically across ${events.length} retrieved events`,
    },
  };
}

export interface ComposeUIInput {
  query: string;
  parsed: ParsedIntent;
  events: RankedEvent[];
  facets: Facets;
  prevTableConfig?: DataTableConfig | null;
  now?: Date;
}

/**
 * Select the smallest useful set of schema-validated UI components for the
 * user's request. Never invents records or fabricates numeric aggregates.
 */
export function composeUIResponse(input: ComposeUIInput): UIResponse {
  const { query, parsed, events, facets, prevTableConfig, now = new Date() } = input;
  const safeEvents = events.map(toSafeEventItem);
  const filterDesc = describeFilters(parsed.filters);
  const subtitle = filterDesc.length ? `Filters: ${filterDesc.join(" · ")}` : `${safeEvents.length} authorized event${safeEvents.length === 1 ? "" : "s"}`;
  const components: UIComponent[] = [];

  if (parsed.intent === "generate_diagram") {
    components.push(buildDocumentedDiagram(query, parsed.requestedDiagramType ?? "flowchart"));
    return validateAndUnwrap({
      type: "ui_response",
      version: "1.0",
      title: "System & Process Diagram",
      subtitle: "Interactive diagram with zoom, pan, node inspection and Mermaid export",
      components,
    });
  }

  if (parsed.intent === "generate_form") {
    components.push(buildFilterFormComponent(facets, parsed.filters));
    return validateAndUnwrap({
      type: "ui_response",
      version: "1.0",
      title: "Dynamic Event Filter Form",
      subtitle: `${facets.total} searchable events across ${facets.categories.length} categories`,
      components,
    });
  }

  if (!safeEvents.length) {
    // Low-confidence / zero results: return helpful filter form to adjust constraints
    components.push(buildFilterFormComponent(facets, parsed.filters));
    return validateAndUnwrap({
      type: "ui_response",
      version: "1.0",
      title: "No Matching Events Found",
      subtitle: filterDesc.length ? `Active filters: ${filterDesc.join(" · ")}` : "Adjust filters or try broader search terms",
      components,
    });
  }

  const resolvedTableConfig = parsed.tableCommand
    ? applyTableCommand(prevTableConfig ?? DEFAULT_TABLE_CONFIG, parsed.tableCommand)
    : prevTableConfig ?? DEFAULT_TABLE_CONFIG;

  switch (parsed.intent) {
    case "build_dashboard": {
      const config: DashboardConfig = {
        title: parsed.topics.length
          ? `${parsed.topics.join(" & ")} Events Analytics Dashboard`
          : "Event Workspace Analytics Dashboard",
        description: `Live interactive overview computed from ${safeEvents.length} authorized records`,
        query: parsed.searchText,
        mode: "hybrid",
        filters: parsed.filters,
        refreshedAt: now.toISOString(),
        widgets: [
          { id: "w_kpi_total", kind: "metric", title: "Matching Events", colSpan: 4, metricKey: "total" },
          { id: "w_kpi_online", kind: "metric", title: "Online Events", colSpan: 4, metricKey: "online" },
          { id: "w_kpi_free", kind: "metric", title: "Free Events", colSpan: 4, metricKey: "free" },
          {
            id: "w_chart_cat",
            kind: "chart",
            title: "Distribution by Category",
            colSpan: 6,
            chartType: "bar",
            dimension: "category",
          },
          {
            id: "w_chart_tech",
            kind: "chart",
            title: "Top Technologies",
            colSpan: 6,
            chartType: "horizontal_bar",
            dimension: "technology",
          },
          {
            id: "w_chart_fmt",
            kind: "chart",
            title: "Online vs In-Person vs Hybrid",
            colSpan: 6,
            chartType: "donut",
            dimension: "format",
          },
          {
            id: "w_chart_time",
            kind: "chart",
            title: "Schedule Trend by Month",
            colSpan: 6,
            chartType: "line",
            dimension: "month",
          },
          {
            id: "w_table",
            kind: "table",
            title: "Upcoming & Ranked Events",
            colSpan: 12,
            tableConfig: { ...resolvedTableConfig, sortBy: "startAt", sortDir: "asc", pageSize: 8 },
          },
        ],
      };
      components.push({
        id: "dashboard_main",
        type: "dashboard",
        props: {
          config,
          events: safeEvents,
          dataSource: "authorized_search_results",
        },
      });
      // If user explicitly asked to compare AND show dashboard (like PRD 1.2), include comparison table
      if (/\bcompare\b/i.test(query)) {
        components.push({
          id: "comparison_1",
          type: "comparison_table",
          props: {
            title: "Side-by-Side Event Comparison",
            compareBy: ["date", "category", "format", "technologies", "score"],
            events: safeEvents.slice(0, 15),
            sortBy: "startAt",
          },
        });
      }
      break;
    }

    case "compare_events": {
      components.push(makeKpiComponent(events));
      components.push({
        id: "comparison_table_1",
        type: "comparison_table",
        props: {
          title: "Event Comparison Matrix",
          subtitle: `Comparing ${Math.min(safeEvents.length, 20)} matching events by date, format, category and stack`,
          compareBy: ["date", "category", "format", "location", "technologies", "isFree", "score"],
          events: safeEvents.slice(0, 20),
          sortBy: "startAt",
        },
      });
      if (parsed.requestedChartType) {
        components.push(makeChartComponent(events, parsed.requestedChartType, parsed.requestedDimension));
      }
      break;
    }

    case "analytics_chart": {
      components.push(makeKpiComponent(events));
      components.push(
        makeChartComponent(
          events,
          parsed.requestedChartType ?? (parsed.requestedDimension === "format" ? "donut" : "bar"),
          parsed.requestedDimension ?? "category",
        ),
      );
      if (parsed.requestedTable) {
        components.push({
          id: "table_supporting",
          type: "data_table",
          props: {
            title: "Underlying Event Records",
            dataSource: "authorized_search_results",
            events: safeEvents,
            config: resolvedTableConfig,
          },
        });
      }
      break;
    }

    case "refine_table": {
      components.push({
        id: "table_refined",
        type: "data_table",
        props: {
          title: "Filtered & Formatted Event Table",
          subtitle,
          dataSource: "authorized_search_results",
          events: safeEvents,
          config: resolvedTableConfig,
        },
      });
      break;
    }

    case "timeline_view": {
      components.push({
        id: "timeline_1",
        type: "timeline",
        props: {
          title: "Chronological Event Timeline",
          subtitle,
          events: [...safeEvents].sort((a, b) => a.startAt.localeCompare(b.startAt)),
        },
      });
      break;
    }

    case "kanban_view": {
      components.push({
        id: "kanban_1",
        type: "kanban",
        props: {
          title: "Events Board",
          subtitle,
          groupBy: parsed.requestedDimension === "format" ? "format" : parsed.requestedDimension === "month" ? "month" : "category",
          events: safeEvents,
        },
      });
      break;
    }

    case "checklist_view": {
      components.push({
        id: "checklist_1",
        type: "checklist",
        props: {
          title: "Shortlisted Event Action Checklist",
          subtitle: "Interactive shortlist derived from retrieved matching events",
          items: safeEvents.slice(0, 12).map((e, idx) => ({
            id: `chk_${idx}`,
            label: `Review & register: ${e.title}`,
            detail: `${e.startAt.slice(0, 10)} · ${e.category} · ${e.isFree ? "Free" : "Paid"}${e.city ? ` · ${e.city}` : " · Online"}`,
            checked: false,
            eventId: e.id,
          })),
        },
      });
      break;
    }

    case "export_report": {
      const topCats = groupCount(events, "category", 6);
      const topTech = groupCount(events, "technology", 8);
      const kpis = computeKpis(events);
      const highlights: string[] = [
        `${kpis.total} authorized event${kpis.total === 1 ? "" : "s"} matched (${kpis.online} online, ${kpis.inPerson} in-person, ${kpis.hybrid} hybrid).`,
        `${kpis.free} event${kpis.free === 1 ? " is" : "s are"} free to attend.`,
      ];
      if (topCats[0]) {
        highlights.push(`Top category: ${topCats[0].label} (${topCats[0].value} events).`);
      }
      if (topTech[0]) {
        highlights.push(`Most represented technology: ${topTech[0].label} (${topTech[0].value} events).`);
      }
      components.push(makeKpiComponent(events));
      components.push({
        id: "report_1",
        type: "report_summary",
        props: {
          title: "Grounded Event Research Report",
          generatedAt: now.toISOString(),
          querySummary: query,
          highlights,
          events: safeEvents,
          topCategories: topCats,
          topTechnologies: topTech,
        },
      });
      break;
    }

    default: {
      // Standard search: show concise KPI strip when >= 3 results + event cards (and table if requested)
      if (safeEvents.length >= 3) {
        components.push(makeKpiComponent(events));
      }
      if (parsed.requestedTable && !parsed.requestedCards) {
        components.push({
          id: "table_1",
          type: "data_table",
          props: {
            title: "Matching Events",
            subtitle,
            dataSource: "authorized_search_results",
            events: safeEvents,
            config: resolvedTableConfig,
          },
        });
      } else {
        components.push({
          id: "cards_1",
          type: "event_cards",
          props: {
            title: "Matching Events",
            subtitle,
            events: safeEvents,
            showScores: true,
          },
        });
        if (parsed.requestedTable) {
          components.push({
            id: "table_1",
            type: "data_table",
            props: {
              title: "Comparison & Details Table",
              dataSource: "authorized_search_results",
              events: safeEvents,
              config: resolvedTableConfig,
            },
          });
        }
      }
      break;
    }
  }

  return validateAndUnwrap({
    type: "ui_response",
    version: "1.0",
    title: parsed.topics.length ? `${parsed.topics.join(" & ")} Events Workspace` : "Semantic Search Results",
    subtitle,
    components,
  });
}

function validateAndUnwrap(spec: UIResponse): UIResponse {
  const checked = validateUISpec(spec);
  if (!checked.ok) {
    throw new Error(`Internal UI spec validation failed: ${checked.errors.join("; ")}`);
  }
  return checked.data;
}

/** Build a compact, non-hallucinated grounded textual summary from retrieved events. */
export function buildDeterministicGroundedSummary(
  query: string,
  parsed: ParsedIntent,
  events: RankedEvent[],
  semanticAvailable: boolean,
  lowConfidence: boolean,
): string {
  if (parsed.intent === "generate_diagram") {
    return `Here is the documented **${(parsed.requestedDiagramType ?? "flowchart").replace("_", " ")}** generated from the system architecture specification. You can pan, zoom, inspect individual nodes, or export it as SVG/PNG/Mermaid.`;
  }
  if (parsed.intent === "generate_form") {
    return "I created an interactive filter form populated from the live categories, technologies, formats, and cities in your authorized event catalog. Submit the form to execute a filtered search directly.";
  }
  if (!events.length) {
    const filterNotes = describeFilters(parsed.filters);
    return `No matching events were found${filterNotes.length ? ` with ${filterNotes.join(", ")}` : ""}. Try relaxing a date or format constraint using the interactive filter builder below.`;
  }

  const kpis = computeKpis(events);
  const top3 = events.slice(0, 3);
  const lines: string[] = [];

  if (lowConfidence) {
    lines.push(
      `Closest partial matches (**${events.length}** event${events.length === 1 ? "" : "s"} found with lower confidence for "${query}"):`,
    );
  } else {
    lines.push(
      `Found **${events.length}** matching event${events.length === 1 ? "" : "s"} (${kpis.online} online, ${kpis.inPerson} in-person, ${kpis.hybrid} hybrid; ${kpis.free} free)${semanticAvailable ? " using hybrid semantic + keyword retrieval" : " using keyword + metadata retrieval"}.`,
    );
  }

  lines.push("");
  for (const e of top3) {
    const date = e.startAt.slice(0, 10);
    const loc = e.city ? `${e.city}` : "Online";
    lines.push(`- **${e.title}** (${date} · ${e.category} · ${loc}) — ${e.explanation.summary}`);
  }
  if (events.length > 3) {
    lines.push(`\nShowing all **${events.length}** verified records in the interactive view below.`);
  }
  return lines.join("\n");
}
