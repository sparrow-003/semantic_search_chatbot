import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Database, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Observability & Embedding Index — Scout" }],
  }),
  component: AdminObservabilityPage,
});

interface MetricsResponse {
  scope: "platform_admin" | "session_telemetry";
  searchRequests: number;
  searchSuccessRate: number;
  noResultRate: number;
  lowConfidenceRate: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  llmCalls: number;
  llmErrors: number;
  embeddingErrors: number;
  totalTokens: number;
  estimatedCostUsd: number;
  uiValidations: number;
  uiValidationSuccessRate: number;
  rateLimitedCount: number;
  securityFlaggedCount: number;
  topTechnologies: Array<{ label: string; count: number }>;
  recentFeedback: Array<{
    rating: string;
    query: string | null;
    comment: string | null;
    createdAt: string;
  }>;
  embeddingStatus: {
    total: number;
    indexed: number;
    pending: number;
    failed: number;
    vectorRows: number;
    embeddingModel: string;
    providerConfigured: boolean;
    adminWritesConfigured: boolean;
  };
}

function AdminObservabilityPage() {
  const queryClient = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const [indexing, setIndexing] = useState(false);

  const {
    data: metrics,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-metrics", activeWorkspaceId],
    queryFn: () =>
      apiFetch<MetricsResponse>(
        activeWorkspaceId
          ? `/api/v1/analytics/metrics?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
          : "/api/v1/analytics/metrics",
      ),
  });

  const triggerIndex = async (force: boolean) => {
    setIndexing(true);
    try {
      const endpoint = force ? "/api/v1/embeddings/reindex" : "/api/v1/embeddings/generate";
      const res = await apiFetch<{ indexed: number; failed: number; skippedUnchanged: number }>(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({ workspaceId: activeWorkspaceId, force, limit: 60 }),
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-metrics"] });
      toast.success(
        `Indexed ${res.indexed}, skipped ${res.skippedUnchanged}, failed ${res.failed}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Indexing requires editor/platform_admin & server keys",
      );
    } finally {
      setIndexing(false);
    }
  };

  const emb = metrics?.embeddingStatus;
  const pctIndexed = emb && emb.total > 0 ? Math.round((emb.indexed / emb.total) * 100) : 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Observability &amp; Vector Index Health
            </h1>
            <p className="text-xs text-muted-foreground">
              Monitor search latency, embedding indexing status, AI token expenditure, UI
              validation, and security events.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-3.5" /> Refresh Metrics
          </Button>
        </div>

        {metrics && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Scope: {metrics.scope}</Badge>
            <Badge variant={emb?.providerConfigured ? "default" : "secondary"}>
              AI Gateway:{" "}
              {emb?.providerConfigured ? "Configured" : "Fallback Mode (No LOVABLE_API_KEY)"}
            </Badge>
            <Badge variant={emb?.adminWritesConfigured ? "default" : "secondary"}>
              Admin Index Writes: {emb?.adminWritesConfigured ? "Ready" : "Read-only Local"}
            </Badge>
          </div>
        )}

        {isLoading || !metrics ? (
          <div className="text-xs text-muted-foreground">Loading operational metrics...</div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Search Requests</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {metrics.searchRequests}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Success rate: {metrics.searchSuccessRate}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">p95 Search Latency</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {metrics.p95LatencyMs} ms
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Avg: {metrics.avgLatencyMs} ms
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">UI Schema Validation</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {metrics.uiValidationSuccessRate}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {metrics.uiValidations} validated specs
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Tokens &amp; Est. Cost</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {metrics.totalTokens.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Est. ${metrics.estimatedCostUsd.toFixed(4)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Embedding Indexing Card */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="size-4 text-primary" /> Vector Embedding Index (
                    {emb?.embeddingModel})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tracks SHA-256 content hashes in pgvector(768) to avoid duplicate embedding
                    calls.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={indexing}
                    onClick={() => void triggerIndex(false)}
                  >
                    <Sparkles className="mr-1.5 size-3.5" /> Index Pending ({emb?.pending ?? 0})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={indexing}
                    onClick={() => void triggerIndex(true)}
                  >
                    Reindex All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span>Indexed Coverage</span>
                  <span className="font-semibold tabular-nums">
                    {emb?.indexed ?? 0} / {emb?.total ?? 0} ({pctIndexed}%)
                  </span>
                </div>
                <Progress value={pctIndexed} className="h-2" />
                <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-bold tabular-nums">{emb?.total}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">Indexed</div>
                    <div className="font-bold text-emerald-600 tabular-nums">{emb?.indexed}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">Pending</div>
                    <div className="font-bold text-amber-600 tabular-nums">{emb?.pending}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">Failed</div>
                    <div className="font-bold text-destructive tabular-nums">{emb?.failed}</div>
                  </div>
                </div>
                {(!emb?.providerConfigured || !emb?.adminWritesConfigured) && (
                  <Alert>
                    <AlertDescription className="text-xs">
                      Full pgvector embedding indexing requires <code>LOVABLE_API_KEY</code> and{" "}
                      <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server. When absent, keyword +
                      metadata search operates cleanly without fabricating semantic scores.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Reliability & Top Techs */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="size-4 text-primary" /> Reliability &amp; Guardrails
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">No-result rate</span>
                    <span className="font-semibold tabular-nums">{metrics.noResultRate}%</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Low-confidence rate</span>
                    <span className="font-semibold tabular-nums">{metrics.lowConfidenceRate}%</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">LLM provider errors</span>
                    <span className="font-semibold tabular-nums">{metrics.llmErrors}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Embedding errors</span>
                    <span className="font-semibold tabular-nums">{metrics.embeddingErrors}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Rate-limited requests</span>
                    <span className="font-semibold tabular-nums">{metrics.rateLimitedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prompt-injection flags</span>
                    <span className="font-semibold tabular-nums">
                      {metrics.securityFlaggedCount}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4 text-primary" /> Top Catalog Technologies
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {metrics.topTechnologies.map((t) => (
                    <div key={t.label} className="flex items-center justify-between">
                      <span>{t.label}</span>
                      <Badge variant="secondary" className="tabular-nums">
                        {t.count} events
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
