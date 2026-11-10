import { z } from "zod";
import { CHART_DIMENSIONS } from "@/lib/events/aggregate";
import { EVENT_FORMATS, SEARCH_MODES } from "@/lib/events/types";

export const MAX_UI_COMPONENTS = 8;
export const MAX_UI_PAYLOAD_BYTES = 180_000;

export const ALLOWED_CHART_TYPES = [
  "bar",
  "horizontal_bar",
  "stacked_bar",
  "line",
  "area",
  "pie",
  "donut",
  "scatter",
  "kpi",
] as const;
export type ChartType = (typeof ALLOWED_CHART_TYPES)[number];

export const ALLOWED_DIAGRAM_TYPES = [
  "flowchart",
  "architecture",
  "process",
  "sequence",
  "er_diagram",
  "mind_map",
  "decision_tree",
  "user_journey",
  "state",
] as const;
export type DiagramType = (typeof ALLOWED_DIAGRAM_TYPES)[number];

export const ALLOWED_FORM_ACTIONS = [
  "filter_search",
  "configure_dashboard",
  "configure_report",
  "save_search",
  "submit_feedback",
] as const;
export type AllowedFormAction = (typeof ALLOWED_FORM_ACTIONS)[number];

export const ALLOWED_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "date_range",
  "email",
  "url",
  "checkbox",
  "radio",
  "select",
  "multi_select",
  "searchable_select",
] as const;
export type FormFieldType = (typeof ALLOWED_FORM_FIELD_TYPES)[number];

export const ALLOWED_TABLE_COLUMNS = [
  "title",
  "category",
  "format",
  "startAt",
  "endAt",
  "location",
  "technologies",
  "audience",
  "isFree",
  "score",
  "description",
  "explanation",
] as const;
export type TableColumnKey = (typeof ALLOWED_TABLE_COLUMNS)[number];

export const safeHttpsUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (val) => /^https:\/\/[^\s<>"{}|\\^`]+$/i.test(val),
    "Only valid https:// URLs are permitted",
  );

export const kpiMetricSchema = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    value: z.union([z.number(), z.string().max(40)]),
    hint: z.string().max(100).optional(),
    trend: z.enum(["up", "down", "neutral"]).optional(),
    accent: z.enum(["default", "primary", "emerald", "amber", "violet"]).optional(),
  })
  .strict();

export const kpiCardsComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("kpi_cards"),
    props: z
      .object({
        title: z.string().max(120).optional(),
        metrics: z.array(kpiMetricSchema).min(1).max(8),
      })
      .strict(),
  })
  .strict();

export const explanationSchema = z
  .object({
    matchedTerms: z.array(z.string().max(60)).max(24),
    matchedTechnologies: z.array(z.string().max(60)).max(20),
    matchedFields: z.array(z.string().max(40)).max(12),
    appliedFilters: z.array(z.string().max(120)).max(12),
    summary: z.string().max(500),
  })
  .strict();

export const eventItemSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid().nullable(),
    title: z.string().min(1).max(160),
    summary: z.string().max(400),
    description: z.string().max(5000),
    category: z.string().max(60),
    format: z.enum(EVENT_FORMATS),
    startAt: z.string().max(40),
    endAt: z.string().max(40).nullable(),
    venue: z.string().max(120).nullable(),
    city: z.string().max(80).nullable(),
    country: z.string().max(80).nullable(),
    registrationUrl: safeHttpsUrlSchema.nullable(),
    technologies: z.array(z.string().max(60)).max(20),
    audience: z.array(z.string().max(60)).max(12),
    isFree: z.boolean(),
    score: z.number().min(0).max(1),
    semanticScore: z.number().min(0).max(1),
    keywordScore: z.number().min(0).max(1),
    metadataScore: z.number().min(0).max(1),
    explanation: explanationSchema,
  })
  .strict();

export const eventCardsComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("event_cards"),
    props: z
      .object({
        title: z.string().max(120).optional(),
        subtitle: z.string().max(240).optional(),
        events: z.array(eventItemSchema).max(60),
        showScores: z.boolean().optional(),
        compact: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const dataTableConfigSchema = z
  .object({
    visibleColumns: z.array(z.enum(ALLOWED_TABLE_COLUMNS)).min(1).max(12),
    sortBy: z.enum(["score", "startAt", "title", "category", "format"]).default("score"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    groupBy: z.enum(["none", "category", "format", "month"]).default("none"),
    pageSize: z.number().int().min(3).max(50).default(10),
    maxRows: z.number().int().min(1).max(60).optional(),
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
  })
  .strict();
export type DataTableConfig = z.infer<typeof dataTableConfigSchema>;

export const dataTableComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("data_table"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        dataSource: z.string().max(64),
        events: z.array(eventItemSchema).max(60),
        config: dataTableConfigSchema,
      })
      .strict(),
  })
  .strict();

export const comparisonTableComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("comparison_table"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        compareBy: z.array(z.string().max(40)).min(1).max(8),
        events: z.array(eventItemSchema).max(30),
        sortBy: z.enum(["startAt", "score", "category", "format"]).default("startAt"),
      })
      .strict(),
  })
  .strict();

export const chartPointSchema = z
  .object({
    label: z.string().min(1).max(80),
    value: z.number().finite(),
    secondaryValue: z.number().finite().optional(),
    breakdown: z.record(z.string().max(40), z.number().finite()).optional(),
  })
  .strict();

export const chartComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("chart"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        chartType: z.enum(ALLOWED_CHART_TYPES),
        dimension: z.enum(CHART_DIMENSIONS),
        xLabel: z.string().max(60).optional(),
        yLabel: z.string().max(60).optional(),
        seriesKeys: z.array(z.string().max(40)).max(6).optional(),
        data: z.array(chartPointSchema).max(50),
        dataSource: z.string().max(64),
        provenanceNote: z.string().max(200).optional(),
      })
      .strict(),
  })
  .strict();

export const diagramNodeSchema = z
  .object({
    id: z.string().min(1).max(48),
    label: z.string().min(1).max(100),
    description: z.string().max(300).optional(),
    kind: z.enum(["input", "process", "storage", "service", "decision", "output", "actor", "note"]).default("process"),
    layer: z.number().int().min(0).max(12).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  })
  .strict();

export const diagramEdgeSchema = z
  .object({
    id: z.string().min(1).max(64),
    source: z.string().min(1).max(48),
    target: z.string().min(1).max(48),
    label: z.string().max(80).optional(),
    animated: z.boolean().optional(),
  })
  .strict();

export const diagramComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("diagram"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        diagramType: z.enum(ALLOWED_DIAGRAM_TYPES),
        nodes: z.array(diagramNodeSchema).min(1).max(40),
        edges: z.array(diagramEdgeSchema).max(60),
        mermaidCode: z.string().min(5).max(8000),
        assumptions: z.array(z.string().max(200)).max(6).optional(),
        groundedSource: z.string().max(160).optional(),
      })
      .strict(),
  })
  .strict();

export const formOptionSchema = z
  .object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(80),
  })
  .strict();

export const formFieldSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),
    label: z.string().min(1).max(80),
    type: z.enum(ALLOWED_FORM_FIELD_TYPES),
    placeholder: z.string().max(120).optional(),
    helpText: z.string().max(200).optional(),
    required: z.boolean().optional(),
    step: z.number().int().min(1).max(5).optional(),
    defaultValue: z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.string().max(80)).max(20)]).optional(),
    options: z.array(formOptionSchema).max(100).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().min(0).max(500).optional(),
    maxLength: z.number().int().min(1).max(2000).optional(),
    dependsOn: z
      .object({
        field: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),
        operator: z.enum(["equals", "not_equals", "non_empty"]),
        value: z.union([z.string(), z.boolean()]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const dynamicFormComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("dynamic_form"),
    props: z
      .object({
        title: z.string().max(120),
        description: z.string().max(280).optional(),
        action: z.enum(ALLOWED_FORM_ACTIONS),
        submitLabel: z.string().min(1).max(40).default("Apply"),
        fields: z.array(formFieldSchema).min(1).max(16),
        multiStep: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const dashboardWidgetSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["metric", "chart", "table", "text"]),
    title: z.string().min(1).max(120),
    colSpan: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]).default(6),
    chartType: z.enum(ALLOWED_CHART_TYPES).optional(),
    dimension: z.enum(CHART_DIMENSIONS).optional(),
    metricKey: z.enum(["total", "upcoming", "online", "inPerson", "hybrid", "free"]).optional(),
    textContent: z.string().max(1200).optional(),
    tableConfig: dataTableConfigSchema.optional(),
  })
  .strict();

export const dashboardConfigSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().max(280).optional(),
    query: z.string().max(400).default(""),
    mode: z.enum(SEARCH_MODES).default("hybrid"),
    filters: z
      .object({
        formats: z.array(z.enum(EVENT_FORMATS)).max(3),
        categories: z.array(z.string().max(60)).max(10),
        technologies: z.array(z.string().max(60)).max(12),
        dateStart: z.string().nullable(),
        dateEnd: z.string().nullable(),
        city: z.string().max(60).nullable(),
      })
      .strict(),
    widgets: z.array(dashboardWidgetSchema).min(1).max(12),
    refreshedAt: z.string().max(40),
  })
  .strict();
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

export const dashboardComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("dashboard"),
    props: z
      .object({
        config: dashboardConfigSchema,
        events: z.array(eventItemSchema).max(60),
        dataSource: z.string().max(64),
      })
      .strict(),
  })
  .strict();

export const timelineComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("timeline"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        events: z.array(eventItemSchema).max(60),
      })
      .strict(),
  })
  .strict();

export const kanbanComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("kanban"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        groupBy: z.enum(["category", "format", "month"]).default("category"),
        events: z.array(eventItemSchema).max(60),
      })
      .strict(),
  })
  .strict();

export const checklistItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(200),
    detail: z.string().max(300).optional(),
    checked: z.boolean().default(false),
    eventId: z.string().uuid().optional(),
  })
  .strict();

export const checklistComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("checklist"),
    props: z
      .object({
        title: z.string().max(120),
        subtitle: z.string().max(240).optional(),
        items: z.array(checklistItemSchema).min(1).max(30),
      })
      .strict(),
  })
  .strict();

export const reportSummaryComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal("report_summary"),
    props: z
      .object({
        title: z.string().max(120),
        generatedAt: z.string().max(40),
        querySummary: z.string().max(400),
        highlights: z.array(z.string().max(300)).max(10),
        events: z.array(eventItemSchema).max(60),
        topCategories: z.array(chartPointSchema).max(10),
        topTechnologies: z.array(chartPointSchema).max(12),
      })
      .strict(),
  })
  .strict();

export const uiComponentSchema = z.discriminatedUnion("type", [
  kpiCardsComponentSchema,
  eventCardsComponentSchema,
  dataTableComponentSchema,
  comparisonTableComponentSchema,
  chartComponentSchema,
  diagramComponentSchema,
  dynamicFormComponentSchema,
  dashboardComponentSchema,
  timelineComponentSchema,
  kanbanComponentSchema,
  checklistComponentSchema,
  reportSummaryComponentSchema,
]);
export type UIComponent = z.infer<typeof uiComponentSchema>;

export const uiResponseSchema = z
  .object({
    type: z.literal("ui_response"),
    version: z.literal("1.0"),
    title: z.string().min(1).max(140),
    subtitle: z.string().max(280).optional(),
    components: z.array(uiComponentSchema).min(1).max(MAX_UI_COMPONENTS),
  })
  .strict();
export type UIResponse = z.infer<typeof uiResponseSchema>;

export const ALLOWED_UI_COMPONENT_TYPES = [
  "kpi_cards",
  "event_cards",
  "data_table",
  "comparison_table",
  "chart",
  "diagram",
  "dynamic_form",
  "dashboard",
  "timeline",
  "kanban",
  "checklist",
  "report_summary",
] as const;
export type UIComponentType = (typeof ALLOWED_UI_COMPONENT_TYPES)[number];
