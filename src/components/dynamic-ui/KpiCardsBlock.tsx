import { CalendarCheck2, Globe2, Sparkles, Ticket, Users } from "lucide-react";
import type { UIComponent } from "@/lib/ui/schema";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiProps = Extract<UIComponent, { type: "kpi_cards" }>["props"];

const ACCENT_CLASSES: Record<string, string> = {
  default: "border-border bg-card",
  primary: "border-primary/20 bg-primary/5",
  emerald: "border-emerald-500/25 bg-emerald-500/5",
  amber: "border-amber-500/25 bg-amber-500/5",
  violet: "border-violet-500/25 bg-violet-500/5",
};

function iconForId(id: string) {
  if (id.includes("online")) return <Globe2 className="size-4 text-emerald-600 dark:text-emerald-400" />;
  if (id.includes("in_person")) return <Users className="size-4 text-violet-600 dark:text-violet-400" />;
  if (id.includes("free")) return <Ticket className="size-4 text-amber-600 dark:text-amber-400" />;
  if (id.includes("upcoming")) return <CalendarCheck2 className="size-4 text-primary" />;
  return <Sparkles className="size-4 text-primary" />;
}

export function KpiCardsBlock({ props }: { props: KpiProps }) {
  return (
    <section aria-label={props.title ?? "Summary metrics"} className="space-y-2">
      {props.title && (
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {props.title}
        </h3>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {props.metrics.map((m) => (
          <Card
            key={m.id}
            className={cn(
              "shadow-xs transition-colors",
              ACCENT_CLASSES[m.accent ?? "default"],
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                {iconForId(m.id)}
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {m.value}
              </div>
              {m.hint && <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
