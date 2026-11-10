import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/client/workspace-context";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile Settings — Scout" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, refreshProfile } = useWorkspace();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.displayName) setDisplayName(profile.displayName);
  }, [profile?.displayName]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: displayName.trim() });
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only PNG, JPEG, or WebP images are permitted.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar must be 2 MB or smaller.");
      return;
    }
    setSaving(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { error: profErr } = await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: displayName || user.email?.split("@")[0] || "User", avatar_url: path });
      if (profErr) throw profErr;

      await refreshProfile();
      toast.success("Avatar uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">Profile &amp; Preferences</h1>

        {!user ? (
          <Alert>
            <AlertDescription className="flex items-center justify-between text-xs">
              <span>Sign in to edit your profile and avatar.</span>
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Details</CardTitle>
              <CardDescription className="text-xs">
                Avatars are stored privately and shared only with your workspace teammates via RLS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback>
                    {(profile?.displayName ?? user.email ?? "U").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Label
                    htmlFor="avatar-upload"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Upload className="size-3.5" /> Upload Avatar (PNG/JPG/WebP, max 2 MB)
                  </Label>
                  <Input
                    id="avatar-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={handleAvatarUpload}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    User ID: <span className="font-mono">{user.id}</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveName} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prof-name" className="text-xs">Display Name</Label>
                  <Input
                    id="prof-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
                <Button type="submit" size="sm" disabled={saving}>
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
