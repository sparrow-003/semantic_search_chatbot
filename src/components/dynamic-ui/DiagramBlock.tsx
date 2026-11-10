import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { Copy, Download, Maximize2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { UIComponent } from "@/lib/ui/schema";
import { sanitizeMermaidCode } from "@/lib/ui/validator";

type DiagramProps = Extract<UIComponent, { type: "diagram" }>["props"];

const KIND_STYLES: Record<string, { border: string; bg: string }> = {
  input: { border: "#2563eb", bg: "rgba(37, 99, 235, 0.08)" },
  process: { border: "#6366f1", bg: "rgba(99, 102, 241, 0.08)" },
  storage: { border: "#0d9488", bg: "rgba(13, 148, 136, 0.08)" },
  service: { border: "#7c3aed", bg: "rgba(124, 58, 237, 0.08)" },
  decision: { border: "#d97706", bg: "rgba(217, 119, 6, 0.08)" },
  output: { border: "#16a34a", bg: "rgba(22, 163, 74, 0.08)" },
  actor: { border: "#0284c7", bg: "rgba(2, 132, 199, 0.08)" },
  note: { border: "#64748b", bg: "rgba(100, 116, 139, 0.08)" },
};

export function DiagramBlock({ props }: { props: DiagramProps }) {
  const { setPendingChatPrompt } = useWorkspace();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidErr, setMermaidErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const flowNodes: Node[] = useMemo(() => {
    const byLayer = new Map<number, number>();
    return props.nodes.map((n, idx) => {
      const layer = n.layer ?? Math.floor(idx / 2);
      const countInLayer = byLayer.get(layer) ?? 0;
      byLayer.set(layer, countInLayer + 1);
      const style = KIND_STYLES[n.kind] ?? KIND_STYLES["process"]!;
      return {
        id: n.id,
        position: {
          x: n.x ?? countInLayer * 240 + 40,
          y: n.y ?? layer * 120 + 24,
        },
        data: {
          label: (
            <div className="space-y-0.5 text-left">
              <div className="text-xs font-semibold leading-tight">{n.label}</div>
              {n.description && (
                <div className="text-[10px] leading-tight text-muted-foreground">
                  {n.description}
                </div>
              )}
            </div>
          ),
        },
        style: {
          width: 210,
          borderRadius: 10,
          border: `1.5px solid ${style.border}`,
          background: style.bg,
          padding: 10,
          color: "var(--foreground)",
        },
      };
    });
  }, [props.nodes]);

  const flowEdges: Edge[] = useMemo(
    () =>
      props.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.label ? { label: e.label } : {}),
        animated: Boolean(e.animated),
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.6 },
        labelStyle: { fontSize: 10 },
      })),
    [props.edges],
  );

  useEffect(() => {
    let active = true;
    const checked = sanitizeMermaidCode(props.mermaidCode);
    if (!checked.ok) {
      setMermaidErr(checked.reason);
      return;
    }
    import("mermaid")
      .then(async (m) => {
        if (!active) return;
        const mermaid = m.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
        });
        const id = `mmd_${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, checked.code);
        if (active) {
          setMermaidSvg(svg);
          setMermaidErr(null);
        }
      })
      .catch((err) => {
        if (active) setMermaidErr(err instanceof Error ? err.message : "Mermaid render failed");
      });
    return () => {
      active = false;
    };
  }, [props.mermaidCode]);

  const selectedNode = props.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const exportPng = async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await toPng(canvasRef.current, { backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${props.diagramType}-diagram.png`;
      a.click();
      toast.success("Exported diagram PNG");
    } catch {
      toast.error("Unable to export PNG from this view");
    }
  };

  const exportSvg = () => {
    if (!mermaidSvg) {
      toast.error("Switch to Mermaid tab to render SVG first.");
      return;
    }
    const blob = new Blob([mermaidSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.diagramType}-diagram.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{props.title}</CardTitle>
            <Badge variant="outline" className="text-[11px] uppercase">
              {props.diagramType.replace("_", " ")}
            </Badge>
          </div>
          {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(props.mermaidCode);
              toast.success("Copied Mermaid definition");
            }}
          >
            <Copy className="size-3" /> Mermaid
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={exportPng}
          >
            <Download className="size-3" /> PNG
          </Button>
          {mermaidSvg && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={exportSvg}
            >
              SVG
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            <Maximize2 className="size-3" /> {expanded ? "Compact" : "Expand"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setPendingChatPrompt(`Regenerate the ${props.diagramType.replace("_", " ")} diagram with more detail`)}
          >
            <RefreshCw className="size-3" /> Regenerate
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-2">
        <Tabs defaultValue="interactive">
          <TabsList className="h-8">
            <TabsTrigger value="interactive" className="text-xs">
              Interactive Canvas
            </TabsTrigger>
            <TabsTrigger value="mermaid" className="text-xs">
              Mermaid Diagram
            </TabsTrigger>
            <TabsTrigger value="source" className="text-xs">
              Definition Source
            </TabsTrigger>
          </TabsList>

          <TabsContent value="interactive" className="mt-2">
            <div
              ref={canvasRef}
              className="w-full overflow-hidden rounded-lg border bg-background"
              style={{ height: expanded ? 520 : 360 }}
            >
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
              >
                <Background gap={16} size={1} />
                <Controls />
                <MiniMap zoomable pannable />
              </ReactFlow>
            </div>
            {selectedNode && (
              <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <div>
                  <span className="font-semibold">{selectedNode.label}</span>{" "}
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {selectedNode.kind}
                  </Badge>
                  {selectedNode.description && (
                    <span className="ml-2 text-muted-foreground">{selectedNode.description}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSelectedNodeId(null)}
                >
                  Clear
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="mermaid" className="mt-2">
            {mermaidErr ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
                {mermaidErr}
              </div>
            ) : mermaidSvg ? (
              <div
                className="overflow-x-auto rounded-lg border bg-background p-4 [&_svg]:mx-auto [&_svg]:max-h-[420px]"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">Rendering Mermaid diagram...</div>
            )}
          </TabsContent>

          <TabsContent value="source" className="mt-2">
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs">
              {props.mermaidCode}
            </pre>
          </TabsContent>
        </Tabs>

        {(props.groundedSource || props.assumptions?.length) && (
          <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            {props.groundedSource && (
              <div>
                <span className="font-medium text-foreground">Grounded source:</span>{" "}
                {props.groundedSource}
              </div>
            )}
            {props.assumptions?.map((a, i) => (
              <div key={i}>
                <span className="font-medium text-foreground">Note:</span> {a}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
