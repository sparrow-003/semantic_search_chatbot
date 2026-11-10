import { useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchOpenRouterModels, type OpenRouterKeyDetails } from "@/lib/client/api";
import { BUILT_IN_MODELS, maskKey, useModelSettings } from "@/lib/client/model-settings";
import { cn } from "@/lib/utils";

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, update } = useModelSettings();
  const [keyDraft, setKeyDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [keyInfo, setKeyInfo] = useState<OpenRouterKeyDetails | null>(null);
  const [filter, setFilter] = useState("");

  const connect = async (key: string) => {
    const clean = key.trim();
    if (!clean) {
      toast.error("Paste your OpenRouter API key first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchOpenRouterModels(clean);
      setKeyInfo(res.key);
      const keepModel = res.models.some((m) => m.id === settings.openRouterModel)
        ? settings.openRouterModel
        : (res.models[0]?.id ?? "openrouter/free");
      update({
        openRouterKey: clean,
        openRouterModels: res.models,
        openRouterModel: keepModel,
        provider: "openrouter",
      });
      setKeyDraft("");
      onOpenChange(false);
      toast.success(`Connected — ${res.models.length} free models available`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to OpenRouter");
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    update({
      openRouterKey: "",
      openRouterModels: [],
      provider: "lovable",
      openRouterModel: "openrouter/free",
    });
    setKeyInfo(null);
    toast.success("OpenRouter key removed from this browser");
  };

  const visibleModels = settings.openRouterModels.filter((m) =>
    `${m.name} ${m.id}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Model settings
          </DialogTitle>
          <DialogDescription>
            Choose Scout's AI provider. Use the configured built-in provider or connect your own
            OpenRouter key to select a free model. Event results always come from the database.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={settings.provider}
          onValueChange={(v) => update({ provider: v as "lovable" | "openrouter" })}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lovable">Built-in AI</TabsTrigger>
            <TabsTrigger value="openrouter">My OpenRouter key</TabsTrigger>
          </TabsList>

          <TabsContent value="lovable" className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Uses this deployment's Lovable AI Gateway. The app server and its provider key must be
              configured; deterministic search summaries remain available without them.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {BUILT_IN_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => update({ lovableModel: m.id })}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50",
                    settings.lovableModel === m.id && "border-primary bg-primary/5",
                  )}
                >
                  <span>{m.label}</span>
                  {settings.lovableModel === m.id && <Check className="size-4 text-primary" />}
                </button>
              ))}
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                update({ provider: "lovable" });
                onOpenChange(false);
              }}
            >
              Continue with built-in AI
            </Button>
          </TabsContent>

          <TabsContent value="openrouter" className="space-y-3 pt-2">
            {settings.openRouterKey ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-primary" />
                  <span className="font-mono">{maskKey(settings.openRouterKey)}</span>
                  {keyInfo?.isFreeTier && <Badge variant="secondary">Free tier</Badge>}
                  {keyInfo?.label && (
                    <span className="text-muted-foreground">· {keyInfo.label}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    disabled={loading}
                    onClick={() => void connect(settings.openRouterKey)}
                  >
                    {loading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    Refresh models
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-destructive"
                    onClick={disconnect}
                  >
                    <Trash2 className="size-3" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void connect(keyDraft);
                }}
              >
                <Label htmlFor="openrouter-key" className="text-xs">
                  OpenRouter API key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="openrouter-key"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-or-v1-…"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                  />
                  <Button type="submit" disabled={loading || !keyDraft.trim()}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Connect"}
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Get a free key at{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                  >
                    openrouter.ai/keys <ExternalLink className="size-3" />
                  </a>
                  . Your key is saved in this browser's local storage. It is sent to the app server
                  for validation and chat when available, or directly to OpenRouter in browser mode;
                  it is not written to your Scout database.
                </p>
              </form>
            )}

            {settings.openRouterModels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">
                    Free models ({settings.openRouterModels.length})
                  </Label>
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter models"
                    className="h-7 w-40 text-xs"
                  />
                </div>
                <ScrollArea className="h-64 rounded-lg border">
                  <div className="space-y-1 p-1.5">
                    {visibleModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => update({ openRouterModel: m.id, provider: "openrouter" })}
                        className={cn(
                          "w-full rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-muted",
                          settings.openRouterModel === m.id && "border-primary bg-primary/5",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{m.name}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            {m.isRouter && <Badge className="text-[10px]">Auto-pick</Badge>}
                            {m.inputModalities.includes("image") && (
                              <Badge variant="outline" className="text-[10px]">
                                Vision
                              </Badge>
                            )}
                            {settings.openRouterModel === m.id && (
                              <Check className="size-4 text-primary" />
                            )}
                          </div>
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {m.id}
                          {m.contextLength
                            ? ` · ${Math.round(m.contextLength / 1000)}k context`
                            : ""}
                        </p>
                        {m.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {m.description}
                          </p>
                        )}
                      </button>
                    ))}
                    {visibleModels.length === 0 && (
                      <p className="p-3 text-center text-xs text-muted-foreground">
                        No models match.
                      </p>
                    )}
                  </div>
                </ScrollArea>
                <p className="text-[11px] text-muted-foreground">
                  Free models have daily limits set by OpenRouter. “Auto-pick” routes each message
                  to whichever free model is available.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
