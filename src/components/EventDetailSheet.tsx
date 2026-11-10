import { Bookmark, Calendar, ExternalLink, MapPin, MessageSquarePlus, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWorkspace } from "@/lib/client/workspace-context";
import { FORMAT_LABELS } from "@/lib/events/types";
import { sanitizeExternalUrl } from "@/lib/ui/validator";
import { cn } from "@/lib/utils";

export function EventDetailSheet() {
  const {
    inspectedEvent,
    setInspectedEvent,
    bookmarkedEventIds,
    toggleBookmarkEvent,
    setPendingChatPrompt,
  } = useWorkspace();

  if (!inspectedEvent) return null;
  const safeUrl = sanitizeExternalUrl(inspectedEvent.registrationUrl);
  const isSaved = bookmarkedEventIds.includes(inspectedEvent.id);

  return (
    <Sheet open={Boolean(inspectedEvent)} onOpenChange={(open) => !open && setInspectedEvent(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-2 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{inspectedEvent.category}</Badge>
            <Badge variant="outline">{FORMAT_LABELS[inspectedEvent.format]}</Badge>
            {inspectedEvent.isFree && (
              <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">Free</Badge>
            )}
          </div>
          <SheetTitle className="text-left text-lg leading-snug">{inspectedEvent.title}</SheetTitle>
          <SheetDescription className="text-left text-xs">
            {inspectedEvent.summary}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 text-sm">
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span>
                {new Date(inspectedEvent.startAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <span>
                {inspectedEvent.venue ?? "Virtual"}{" "}
                {inspectedEvent.city ? `— ${inspectedEvent.city}, ${inspectedEvent.country ?? ""}` : ""}
              </span>
            </div>
            {inspectedEvent.audience.length > 0 && (
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <span>Audience: {inspectedEvent.audience.join(", ")}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </h4>
            <p className="text-sm leading-relaxed text-foreground/90">{inspectedEvent.description}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Technologies
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {inspectedEvent.technologies.map((tech) => (
                <Badge key={tech} variant="secondary" className="text-xs">
                  {tech}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-3.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="size-3.5 text-primary" /> Grounded Match Explanation
              </span>
              <span className="text-xs font-bold tabular-nums text-primary">
                {Math.round(inspectedEvent.score * 100)}% relevance
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{inspectedEvent.explanation.summary}</p>
            <div className="space-y-2 pt-1 text-[11px]">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Semantic Similarity</span>
                  <span className="tabular-nums">{Math.round(inspectedEvent.semanticScore * 100)}%</span>
                </div>
                <Progress value={inspectedEvent.semanticScore * 100} className="h-1.5" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Keyword Relevance</span>
                  <span className="tabular-nums">{Math.round(inspectedEvent.keywordScore * 100)}%</span>
                </div>
                <Progress value={inspectedEvent.keywordScore * 100} className="h-1.5" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Metadata Alignment</span>
                  <span className="tabular-nums">{Math.round(inspectedEvent.metadataScore * 100)}%</span>
                </div>
                <Progress value={inspectedEvent.metadataScore * 100} className="h-1.5" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => toggleBookmarkEvent(inspectedEvent.id)}
            >
              <Bookmark className={cn("size-3.5", isSaved && "fill-primary text-primary")} />
              {isSaved ? "Saved" : "Save Event"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setPendingChatPrompt(`Find similar events to "${inspectedEvent.title}" and compare them`);
                setInspectedEvent(null);
              }}
            >
              <MessageSquarePlus className="size-3.5" />
              Find Similar in Chat
            </Button>
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Registration Page <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

