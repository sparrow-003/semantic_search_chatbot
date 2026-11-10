import { useState } from "react";
import {
  Bookmark,
  Calendar,
  ExternalLink,
  Info,
  MapPin,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FORMAT_LABELS, type RankedEvent } from "@/lib/events/types";
import { submitSearchFeedback } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { UIComponent } from "@/lib/ui/schema";
import { sanitizeExternalUrl } from "@/lib/ui/validator";
import { cn } from "@/lib/utils";

type EventCardsProps = Extract<UIComponent, { type: "event_cards" }>["props"];

function formatDateBadge(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function EventCardsBlock({
  props,
  messageId,
  query,
}: {
  props: EventCardsProps;
  messageId?: string;
  query?: string;
}) {
  const { bookmarkedEventIds, toggleBookmarkEvent, setInspectedEvent } = useWorkspace();
  const [showAll, setShowAll] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});

  if (!props.events.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No event cards match the current selection.
        </CardContent>
      </Card>
    );
  }

  const visibleEvents = showAll ? props.events : props.events.slice(0, 9);

  const handleFeedback = async (
    ev: RankedEvent,
    rating: "useful" | "irrelevant" | "incorrect_explanation",
  ) => {
    setFeedbackSent((prev) => ({ ...prev, [ev.id]: rating }));
    try {
      await submitSearchFeedback({
        ...(messageId ? { messageId } : {}),
        query: query ?? ev.title,
        rating,
        comment: `Event: ${ev.title}`,
      });
      toast.success("Thanks for the search quality feedback.");
    } catch {
      toast.error("Unable to submit feedback right now.");
    }
  };

  return (
    <section aria-label={props.title ?? "Matching events"} className="space-y-3">
      {(props.title || props.subtitle) && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            {props.title && <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>}
            {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            Showing {visibleEvents.length} of {props.events.length}
          </span>
        </div>
      )}

      <div className={cn("grid gap-3", props.compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
        {visibleEvents.map((ev) => {
          const safeUrl = sanitizeExternalUrl(ev.registrationUrl);
          const isSaved = bookmarkedEventIds.includes(ev.id);
          const scorePct = Math.round(ev.score * 100);
          return (
            <Card
              key={ev.id}
              className="group flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[11px] font-medium">
                      {ev.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        ev.format === "online" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                        ev.format === "in_person" && "border-violet-500/40 text-violet-700 dark:text-violet-300",
                        ev.format === "hybrid" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {FORMAT_LABELS[ev.format]}
                    </Badge>
                    {ev.isFree && (
                      <Badge className="bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/20 dark:text-emerald-300 text-[11px]">
                        Free
                      </Badge>
                    )}
                  </div>

                  {props.showScores !== false && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                            <Sparkles className="size-3" />
                            {scorePct}%
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs space-y-1 text-xs">
                          <div className="font-semibold">Relevance Breakdown</div>
                          <div>Semantic: {Math.round(ev.semanticScore * 100)}%</div>
                          <div>Keyword: {Math.round(ev.keywordScore * 100)}%</div>
                          <div>Metadata: {Math.round(ev.metadataScore * 100)}%</div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                <CardTitle
                  className="cursor-pointer text-base leading-snug transition-colors group-hover:text-primary"
                  onClick={() => setInspectedEvent(ev as RankedEvent)}
                >
                  {ev.title}
                </CardTitle>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    {formatDateBadge(ev.startAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ""}` : ev.venue ?? "Virtual"}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pb-3 text-xs">
                <p className="line-clamp-2 text-muted-foreground">{ev.summary}</p>

                <div className="flex flex-wrap gap-1">
                  {ev.technologies.slice(0, 5).map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/80"
                    >
                      {tech}
                    </span>
                  ))}
                </div>

                <div className="rounded-md border border-border/70 bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Info className="size-3 text-primary" /> Why it matched:
                  </span>{" "}
                  {ev.explanation.summary}
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between gap-2 border-t pt-3">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={isSaved ? "Remove bookmark" : "Bookmark event"}
                    onClick={() => {
                      toggleBookmarkEvent(ev.id);
                      toast.success(isSaved ? "Removed from saved events" : "Saved event");
                    }}
                  >
                    <Bookmark className={cn("size-3.5", isSaved && "fill-primary text-primary")} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn("size-7", feedbackSent[ev.id] === "useful" && "text-emerald-600")}
                    aria-label="Mark useful"
                    onClick={() => handleFeedback(ev as RankedEvent, "useful")}
                  >
                    <ThumbsUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn("size-7", feedbackSent[ev.id] === "irrelevant" && "text-destructive")}
                    aria-label="Mark irrelevant"
                    onClick={() => handleFeedback(ev as RankedEvent, "irrelevant")}
                  >
                    <ThumbsDown className="size-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setInspectedEvent(ev as RankedEvent)}
                  >
                    Details
                  </Button>
                  {safeUrl && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Visit <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {props.events.length > 9 && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer events" : `Show all ${props.events.length} matching events`}
          </Button>
        </div>
      )}
    </section>
  );
}

