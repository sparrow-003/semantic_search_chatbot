import { describe, expect, it } from "vitest";
import { buildDocumentedDiagram } from "@/lib/ai/ui-composer";
import {
  applyTableCommand,
  sanitizeExternalUrl,
  sanitizeMermaidCode,
  validateUISpec,
} from "@/lib/ui/validator";
import { MAX_UI_COMPONENTS, type DataTableConfig } from "@/lib/ui/schema";

describe("dynamic UI schema validation and sanitization", () => {
  it("validates a well-formed UIResponse specification", () => {
    const diagram = buildDocumentedDiagram("Show semantic search flow", "flowchart");
    const res = validateUISpec({
      type: "ui_response",
      version: "1.0",
      title: "Pipeline Diagram",
      components: [diagram],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown component types and unknown extra properties", () => {
    const badType = validateUISpec({
      type: "ui_response",
      version: "1.0",
      title: "Bad",
      components: [{ id: "x", type: "raw_html_script", props: { html: "<script>alert(1)</script>" } }],
    });
    expect(badType.ok).toBe(false);

    const extraProp = validateUISpec({
      type: "ui_response",
      version: "1.0",
      title: "Bad Extra",
      components: [
        {
          id: "k1",
          type: "kpi_cards",
          props: {
            metrics: [{ id: "m1", label: "Total", value: 5 }],
            dangerouslySetInnerHTML: "bad",
          },
        },
      ],
    });
    expect(extraProp.ok).toBe(false);
  });

  it("blocks unsafe URLs and malicious Mermaid directives", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeExternalUrl("http://insecure.example.com")).toBeNull();
    expect(sanitizeExternalUrl("https://events.example.com/ok")).toBe("https://events.example.com/ok");

    expect(sanitizeMermaidCode("flowchart TD\n  A --> B").ok).toBe(true);
    expect(sanitizeMermaidCode("flowchart TD\n  click A call alert(1)").ok).toBe(false);
    expect(sanitizeMermaidCode("flowchart TD\n  A[<script>alert(1)</script>] --> B").ok).toBe(false);
    expect(sanitizeMermaidCode("unknownHeader\n  A --> B").ok).toBe(false);
  });

  it("rejects specs exceeding MAX_UI_COMPONENTS and dangling diagram edges", () => {
    const tooMany = Array.from({ length: MAX_UI_COMPONENTS + 1 }, (_, i) => ({
      id: `k_${i}`,
      type: "kpi_cards",
      props: { metrics: [{ id: "m", label: "M", value: i }] },
    }));
    expect(
      validateUISpec({
        type: "ui_response",
        version: "1.0",
        title: "Too many",
        components: tooMany,
      }).ok,
    ).toBe(false);

    const badEdge = validateUISpec({
      type: "ui_response",
      version: "1.0",
      title: "Dangling edge",
      components: [
        {
          id: "d1",
          type: "diagram",
          props: {
            title: "D",
            diagramType: "flowchart",
            nodes: [{ id: "a", label: "A", kind: "input" }],
            edges: [{ id: "e1", source: "a", target: "missing_node" }],
            mermaidCode: "flowchart TD\n  A --> B",
          },
        },
      ],
    });
    expect(badEdge.ok).toBe(false);
  });

  it("applies natural-language table commands safely", () => {
    const base: DataTableConfig = {
      visibleColumns: ["title", "category", "description", "score"],
      sortBy: "score",
      sortDir: "desc",
      groupBy: "none",
      pageSize: 10,
      density: "comfortable",
    };
    const next = applyTableCommand(base, {
      hideColumns: ["description"],
      sortBy: "startAt",
      sortDir: "asc",
      groupBy: "category",
      maxRows: 5,
    });
    expect(next.visibleColumns).not.toContain("description");
    expect(next.sortBy).toBe("startAt");
    expect(next.sortDir).toBe("asc");
    expect(next.groupBy).toBe("category");
    expect(next.maxRows).toBe(5);
  });
});

