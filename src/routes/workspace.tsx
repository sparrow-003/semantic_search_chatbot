import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarPlus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { EventFormat, EventRecord } from "@/lib/events/types";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [{ title: "Team Workspaces & Events — Scout" }],
  }),
  component: WorkspaceManagementPage,
});

interface MemberRow {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "editor" | "member" | "viewer";
  display_name: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function WorkspaceManagementPage() {
  const queryClient = useQueryClient();
  const { user, workspaces, activeWorkspaceId, setActiveWorkspaceId, refreshWorkspaces } =
    useWorkspace();

  const [newWsName, setNewWsName] = useState("");
  const [inviteValue, setInviteValue] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "member" | "viewer">("member");

  // Event Editor State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Workshop");
  const [format, setFormat] = useState<EventFormat>("online");
  const [startAt, setStartAt] = useState("2026-12-20T16:00");
  const [city, setCity] = useState("");
  const [techs, setTechs] = useState("React, TypeScript");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(true);

  const selectedWs = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const { data: membersData } = useQuery({
    queryKey: ["ws-members", selectedWs?.id],
    enabled: Boolean(user && selectedWs?.id),
    queryFn: () =>
      apiFetch<{ members: MemberRow[] }>(`/api/v1/workspaces/${selectedWs!.id}/members`),
  });

  const { data: wsEventsData } = useQuery({
    queryKey: ["ws-events", selectedWs?.id],
    enabled: Boolean(user && selectedWs?.id),
    queryFn: () =>
      apiFetch<{ events: Array<EventRecord & { indexStatus: string; status: string }> }>(
        `/api/v1/events?workspaceId=${encodeURIComponent(selectedWs!.id)}`,
      ),
  });

  const isAdminOrOwner = selectedWs?.role === "owner" || selectedWs?.role === "admin";
  const canEditEvents = isAdminOrOwner || selectedWs?.role === "editor";

  const { data: auditData } = useQuery({
    queryKey: ["ws-audit", selectedWs?.id],
    enabled: Boolean(user && selectedWs?.id && isAdminOrOwner),
    queryFn: () => apiFetch<{ logs: AuditLogRow[] }>(`/api/v1/workspaces/${selectedWs!.id}/audit`),
  });

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    try {
      const res = await apiFetch<{ workspace: { id: string } }>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: newWsName.trim() }),
      });
      setNewWsName("");
      await refreshWorkspaces();
      setActiveWorkspaceId(res.workspace.id);
      toast.success("Workspace created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create workspace");
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWs || !inviteValue.trim()) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      inviteValue.trim(),
    );
    try {
      await apiFetch(`/api/v1/workspaces/${selectedWs.id}/members`, {
        method: "POST",
        body: JSON.stringify({
          ...(isUuid ? { userId: inviteValue.trim() } : { email: inviteValue.trim() }),
          role: inviteRole,
        }),
      });
      setInviteValue("");
      await queryClient.invalidateQueries({ queryKey: ["ws-members", selectedWs.id] });
      toast.success("Member added to workspace");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to add member");
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWs) return;
    try {
      await apiFetch("/api/v1/events", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: selectedWs.id,
          title,
          summary,
          description,
          category,
          format,
          startAt: new Date(startAt).toISOString(),
          city: city.trim() || null,
          technologies: techs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          audience: ["Developers"],
          isFree,
          status: "published",
        }),
      });
      setTitle("");
      setSummary("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["ws-events", selectedWs.id] });
      toast.success("Workspace event published & queued for indexing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create event");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Workspaces &amp; Event Studio</h1>
            <p className="text-xs text-muted-foreground">
              Multi-tenant isolated workspaces with role-based permissions, private events, and audit logs.
            </p>
          </div>
        </div>

        {!user ? (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>Sign in to create team workspaces, manage role permissions, and publish private tenant events.</span>
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-primary" /> Your Workspaces
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Select a workspace to manage members, events, or audit logs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                        selectedWs?.id === ws.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="font-medium text-left hover:text-primary"
                        onClick={() => setActiveWorkspaceId(ws.id)}
                      >
                        {ws.name}
                      </button>
                      <Badge variant="secondary" className="text-[11px]">
                        {ws.role}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Create New Workspace</CardTitle>
                  <CardDescription className="text-xs">
                    Every workspace isolates private events, dashboards, and search indexes via RLS.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateWorkspace} className="flex gap-2">
                    <Input
                      aria-label="Workspace name"
                      placeholder="e.g., Frontend Guild"
                      value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                      className="text-xs"
                    />
                    <Button type="submit" size="sm" disabled={!newWsName.trim()}>
                      Create
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {selectedWs && (
              <Tabs defaultValue="members">
                <TabsList>
                  <TabsTrigger value="members" className="text-xs">Members &amp; Roles</TabsTrigger>
                  <TabsTrigger value="events" className="text-xs">Workspace Events</TabsTrigger>
                  {isAdminOrOwner && (
                    <TabsTrigger value="audit" className="text-xs">Audit Logs</TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="members" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Members — {selectedWs.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {isAdminOrOwner && (
                        <form onSubmit={handleInviteMember} className="flex flex-wrap gap-2">
                          <Input
                            aria-label="Member email or user UUID"
                            placeholder="User email or UUID..."
                            value={inviteValue}
                            onChange={(e) => setInviteValue(e.target.value)}
                            className="min-w-[220px] flex-1 text-xs"
                          />
                          <Select
                            value={inviteRole}
                            onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
                          >
                            <SelectTrigger className="w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button type="submit" size="sm" className="gap-1.5 text-xs">
                            <UserPlus className="size-3.5" /> Add Member
                          </Button>
                        </form>
                      )}

                      <div className="space-y-2">
                        {(membersData?.members ?? []).map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs"
                          >
                            <div>
                              <div className="font-medium">{m.display_name}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {m.user_id}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isAdminOrOwner && m.role !== "owner" ? (
                                <Select
                                  value={m.role}
                                  onValueChange={async (role) => {
                                    await apiFetch(
                                      `/api/v1/workspaces/${selectedWs.id}/members`,
                                      {
                                        method: "PATCH",
                                        body: JSON.stringify({ userId: m.user_id, role }),
                                      },
                                    );
                                    await queryClient.invalidateQueries({
                                      queryKey: ["ws-members", selectedWs.id],
                                    });
                                    toast.success("Role updated");
                                  }}
                                >
                                  <SelectTrigger className="h-7 w-[110px] text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">admin</SelectItem>
                                    <SelectItem value="editor">editor</SelectItem>
                                    <SelectItem value="member">member</SelectItem>
                                    <SelectItem value="viewer">viewer</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="secondary">{m.role}</Badge>
                              )}

                              {isAdminOrOwner && m.user_id !== user.id && m.role !== "owner" && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-destructive"
                                  onClick={async () => {
                                    await apiFetch(
                                      `/api/v1/workspaces/${selectedWs.id}/members`,
                                      {
                                        method: "DELETE",
                                        body: JSON.stringify({ userId: m.user_id }),
                                      },
                                    );
                                    await queryClient.invalidateQueries({
                                      queryKey: ["ws-members", selectedWs.id],
                                    });
                                    toast.success("Member removed");
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="events" className="mt-4 space-y-4">
                  {canEditEvents && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <CalendarPlus className="size-4 text-primary" /> Add Private Workspace Event
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleCreateEvent} className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Title *</Label>
                            <Input required value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Category *</Label>
                            <Input required value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Format</Label>
                            <Select value={format} onValueChange={(v) => setFormat(v as EventFormat)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="online">Online</SelectItem>
                                <SelectItem value="in_person">In person</SelectItem>
                                <SelectItem value="hybrid">Hybrid</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Start Date &amp; Time</Label>
                            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Technologies (comma separated)</Label>
                            <Input value={techs} onChange={(e) => setTechs(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">City (optional)</Label>
                            <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Summary</Label>
                            <Input value={summary} onChange={(e) => setSummary(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Description</Label>
                            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-xs" rows={2} />
                          </div>
                          <div className="flex items-center justify-between sm:col-span-2">
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
                              Free admission
                            </label>
                            <Button type="submit" size="sm">Publish Event</Button>
                          </div>
                        </form>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Workspace Private Events</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      {!(wsEventsData?.events.length) ? (
                        <p className="text-muted-foreground">No private events in this workspace yet.</p>
                      ) : (
                        wsEventsData.events.map((ev) => (
                          <div key={ev.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                              <div className="font-semibold">{ev.title}</div>
                              <div className="text-muted-foreground">
                                {ev.startAt.slice(0, 10)} · {ev.category} · Index: {ev.indexStatus}
                              </div>
                            </div>
                            {canEditEvents && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive"
                                onClick={async () => {
                                  await apiFetch(`/api/v1/events/${ev.id}`, { method: "DELETE" });
                                  await queryClient.invalidateQueries({ queryKey: ["ws-events", selectedWs.id] });
                                  toast.success("Event deleted");
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {isAdminOrOwner && (
                  <TabsContent value="audit" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <ShieldCheck className="size-4 text-primary" /> Workspace Audit Log
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        {!(auditData?.logs.length) ? (
                          <p className="text-muted-foreground">No audit entries yet.</p>
                        ) : (
                          auditData.logs.map((log) => (
                            <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                              <div>
                                <Badge variant="outline" className="mr-2 text-[10px]">{log.action}</Badge>
                                <span className="font-medium">{log.resource_type}</span>
                                <span className="ml-2 text-muted-foreground">
                                  {JSON.stringify(log.metadata)}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {new Date(log.created_at).toLocaleString()}
                              </span>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
