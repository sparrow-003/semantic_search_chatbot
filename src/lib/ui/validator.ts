import {
  ALLOWED_TABLE_COLUMNS,
  MAX_UI_PAYLOAD_BYTES,
  uiResponseSchema,
  type DataTableConfig,
  type TableColumnKey,
  type UIResponse,
} from "./schema";

export type UIValidationResult = { ok: true; data: UIResponse } | { ok: false; errors: string[] };

const MERMAID_HEADER_RE =
  /^(flowchart|graph|sequenceDiagram|erDiagram|stateDiagram-v2|stateDiagram|mindmap|journey)\b/;

const DANGEROUS_MERMAID_PATTERNS = [
  /<script\b/i,
  /<\/?\w+[^>]*on\w+\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /^\s*click\s+[^\n]*\bcall\b/im,
  /^\s*click\s+[^\n]*\bhref\b/im,
];

/**
 * Validate a Mermaid diagram definition against an allowlisted set of diagram
 * headers and reject active scripts, DOM handlers, or link injection directives.
 */
export function sanitizeMermaidCode(
  raw: string,
): { ok: true; code: string } | { ok: false; reason: string } {
  const code = raw.trim();
  if (!code || code.length > 8000) {
    return { ok: false, reason: "Diagram definition is empty or exceeds 8,000 characters." };
  }
  const firstLine = code.split(/\r?\n/)[0]?.trim() ?? "";
  if (!MERMAID_HEADER_RE.test(firstLine)) {
    return {
      ok: false,
      reason: `Unsupported Mermaid diagram header "${firstLine.slice(0, 40)}".`,
    };
  }
  for (const pat of DANGEROUS_MERMAID_PATTERNS) {
    if (pat.test(code)) {
      return {
        ok: false,
        reason: "Diagram definition contains disallowed script or callback syntax.",
      };
    }
  }
  return { ok: true, code };
}

/**
 * Validate external registration / resource URLs so untrusted records or AI
 * outputs can never emit javascript:, data:, or plain http: links.
 */
export function sanitizeExternalUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validate any AI-produced or client-submitted UI specification against the
 * strict allowlisted Zod schema, payload budget, and diagram safety rules.
 */
export function validateUISpec(raw: unknown): UIValidationResult {
  let serializedSize = 0;
  try {
    serializedSize = JSON.stringify(raw)?.length ?? 0;
  } catch {
    return { ok: false, errors: ["UI specification is not JSON-serializable."] };
  }
  if (serializedSize > MAX_UI_PAYLOAD_BYTES) {
    return {
      ok: false,
      errors: [`UI specification exceeds maximum payload size (${MAX_UI_PAYLOAD_BYTES} bytes).`],
    };
  }

  const parsed = uiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
    return { ok: false, errors };
  }

  const extraErrors: string[] = [];
  for (const comp of parsed.data.components) {
    if (comp.type === "diagram") {
      const m = sanitizeMermaidCode(comp.props.mermaidCode);
      if (!m.ok) {
        extraErrors.push(`components.${comp.id}.props.mermaidCode: ${m.reason}`);
      }
      const nodeIds = new Set(comp.props.nodes.map((n) => n.id));
      for (const edge of comp.props.edges) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          extraErrors.push(
            `components.${comp.id}.props.edges.${edge.id}: references unknown node (${edge.source} -> ${edge.target})`,
          );
        }
      }
    }
  }

  if (extraErrors.length) {
    return { ok: false, errors: extraErrors };
  }

  return { ok: true, data: parsed.data };
}

export interface TableRefinementCommand {
  sortBy?: DataTableConfig["sortBy"];
  sortDir?: DataTableConfig["sortDir"];
  hideColumns?: TableColumnKey[];
  showColumns?: TableColumnKey[];
  groupBy?: DataTableConfig["groupBy"];
  maxRows?: number;
  pageSize?: number;
  density?: DataTableConfig["density"];
}

/**
 * Mutate a validated DataTableConfig safely in response to natural-language
 * table refinement commands ("hide description", "sort by date", "top 10").
 */
export function applyTableCommand(
  config: DataTableConfig,
  cmd: TableRefinementCommand,
): DataTableConfig {
  let visible = [...config.visibleColumns];
  if (cmd.hideColumns?.length) {
    const hidden = new Set(cmd.hideColumns);
    const filtered = visible.filter((c) => !hidden.has(c));
    if (filtered.length > 0) visible = filtered;
  }
  if (cmd.showColumns?.length) {
    for (const c of cmd.showColumns) {
      if ((ALLOWED_TABLE_COLUMNS as readonly string[]).includes(c) && !visible.includes(c)) {
        visible.push(c);
      }
    }
  }
  const next: DataTableConfig = {
    visibleColumns: visible,
    sortBy: cmd.sortBy ?? config.sortBy,
    sortDir: cmd.sortDir ?? config.sortDir,
    groupBy: cmd.groupBy ?? config.groupBy,
    pageSize: cmd.pageSize ?? config.pageSize,
    density: cmd.density ?? config.density,
  };
  if (cmd.maxRows !== undefined) {
    next.maxRows = Math.min(60, Math.max(1, cmd.maxRows));
  } else if (config.maxRows !== undefined) {
    next.maxRows = config.maxRows;
  }
  return next;
}
