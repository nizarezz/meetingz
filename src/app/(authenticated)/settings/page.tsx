"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "next-themes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, usersApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Monitor, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "" },
  });

  const { data: prefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => notificationsApi.get(),
  });

  const updatePrefs = useMutation({
    mutationFn: (patch: Record<string, boolean>) => notificationsApi.update(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Preferences updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (user?.user_metadata?.name) {
      reset({ name: user.user_metadata.name as string });
    }
  }, [user, reset]);

  async function saveProfile(data: ProfileFormData) {
    if (!user) return;
    try {
      await supabase.auth.updateUser({ data: { name: data.name.trim() } });
      await usersApi.update(user.id, { name: data.name.trim() });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled className="bg-muted" />
          </div>
          <form onSubmit={handleSubmit(saveProfile)} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <Button type="submit">
              Save Profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {[
              { value: "light", icon: Sun, label: "Light" },
              { value: "dark", icon: Moon, label: "Dark" },
              { value: "system", icon: Monitor, label: "System" },
            ].map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm transition hover:bg-accent",
                  theme === value && "border-primary bg-accent font-medium",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            label="Meeting Reminder (Email)"
            checked={prefs?.meeting_reminder_email ?? true}
            onChange={(v) => updatePrefs.mutate({ meeting_reminder_email: v })}
          />
          <SwitchRow
            label="Meeting Reminder (Push)"
            checked={prefs?.meeting_reminder_push ?? false}
            onChange={(v) => updatePrefs.mutate({ meeting_reminder_push: v })}
          />
          <SwitchRow
            label="Outcome Prompt (Email)"
            checked={prefs?.outcome_prompt_email ?? true}
            onChange={(v) => updatePrefs.mutate({ outcome_prompt_email: v })}
          />
          <SwitchRow
            label="Outcome Prompt (Push)"
            checked={prefs?.outcome_prompt_push ?? false}
            onChange={(v) => updatePrefs.mutate({ outcome_prompt_push: v })}
          />
          <SwitchRow
            label="Daily Digest (Email)"
            checked={prefs?.daily_digest_email ?? false}
            onChange={(v) => updatePrefs.mutate({ daily_digest_email: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
