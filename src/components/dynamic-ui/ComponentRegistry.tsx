import React, { lazy, Suspense } from "react";
import { AlertTriangle, Maximize2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { RankedEvent } from "@/lib/events/types";
import type { AllowedFormAction, UIComponent, UIResponse } from "@/lib/ui/schema";
import { validateUISpec } from "@/lib/ui/validator";
import { ComparisonTableBlock } from "./ComparisonTableBlock";
import { DashboardBlock } from "./DashboardBlock";
import { DataTableBlock } from "./DataTableBlock";
import { DynamicFormBlock } from "./DynamicFormBlock";
import { EventCardsBlock } from "./EventCardsBlock";
import { KpiCardsBlock } from "./KpiCardsBlock";
import {
  ChecklistBlock,
  KanbanBlock,
  ReportSummaryBlock,
  TimelineBlock,
} from "./TimelineKanbanChecklistReport";

const LazyChartBlock = lazy(() => import("./ChartBlock").then((m) => ({ default: m.ChartBlock })));
const LazyDiagramBlock = lazy(() =>
  import("./DiagramBlock").then((m) => ({ default: m.DiagramBlock })),
);

/** Controlled, allowlisted UI component registry (never executes arbitrary code). */
export const COMPONENT_REGISTRY = {
  kpi_cards: KpiCardsBlock,
  event_cards: EventCardsBlock,
  data_table: DataTableBlock,
  comparison_table: ComparisonTableBlock,
  chart: LazyChartBlock,
  diagram: LazyDiagramBlock,
  dynamic_form: DynamicFormBlock,
  dashboard: DashboardBlock,
  timeline: TimelineBlock,
  kanban: KanbanBlock,
  checklist: ChecklistBlock,
  report_summary: ReportSummaryBlock,
} as const;

class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; label: string },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; label: string }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Unable to render {this.props.label}</AlertTitle>
          <AlertDescription className="text-xs">{this.state.error.message}</AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

export function RenderSingleUIComponent({
  component,
  messageId,
  query,
  onFormSubmit,
}: {
  component: UIComponent;
  messageId?: string;
  query?: string;
  onFormSubmit?: (action: AllowedFormAction, values: Record<string, unknown>) => void;
}) {
  switch (component.type) {
    case "kpi_cards":
      return <KpiCardsBlock props={component.props} />;
    case "event_cards":
      return (
        <EventCardsBlock
          props={component.props}
          {...(messageId ? { messageId } : {})}
          {...(query ? { query } : {})}
        />
      );
    case "data_table":
      return <DataTableBlock props={component.props} />;
    case "comparison_table":
      return <ComparisonTableBlock props={component.props} />;
    case "chart":
      return (
        <Suspense fallback={<Skeleton className="h-[340px] w-full rounded-xl" />}>
          <LazyChartBlock props={component.props} />
        </Suspense>
      );
    case "diagram":
      return (
        <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-xl" />}>
          <LazyDiagramBlock props={component.props} />
        </Suspense>
      );
    case "dynamic_form":
      return (
        <DynamicFormBlock props={component.props} {...(onFormSubmit ? { onFormSubmit } : {})} />
      );
    case "dashboard":
      return <DashboardBlock props={component.props} />;
    case "timeline":
      return <TimelineBlock props={component.props} />;
    case "kanban":
      return <KanbanBlock props={component.props} />;
    case "checklist":
      return <ChecklistBlock props={component.props} />;
    case "report_summary":
      return <ReportSummaryBlock props={component.props} />;
    default: {
      const _exhaustive: never = component;
      return _exhaustive;
    }
  }
}

export function DynamicUISpecRenderer({
  spec,
  events = [],
  messageId,
  query,
  allowPopOut = true,
  onFormSubmit,
}: {
  spec: UIResponse;
  events?: RankedEvent[];
  messageId?: string;
  query?: string;
  allowPopOut?: boolean;
  onFormSubmit?: (action: AllowedFormAction, values: Record<string, unknown>) => void;
}) {
  const { setCanvasSpec } = useWorkspace();
  const validated = validateUISpec(spec);

  if (!validated.ok) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Unsafe or invalid UI specification blocked</AlertTitle>
        <AlertDescription className="text-xs">
          {validated.errors.slice(0, 3).join("; ")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {allowPopOut && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-foreground">{validated.data.title}</div>
            {validated.data.subtitle && (
              <div className="text-[11px] text-muted-foreground">{validated.data.subtitle}</div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() =>
              setCanvasSpec({
                title: validated.data.title,
                spec: validated.data,
                events,
              })
            }
          >
            <Maximize2 className="size-3" /> Expand Canvas
          </Button>
        </div>
      )}

      {validated.data.components.map((component) => (
        <ComponentErrorBoundary key={component.id} label={component.type}>
          <RenderSingleUIComponent
            component={component}
            {...(messageId ? { messageId } : {})}
            {...(query ? { query } : {})}
            {...(onFormSubmit ? { onFormSubmit } : {})}
          />
        </ComponentErrorBoundary>
      ))}
    </div>
  );
}
