"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "next-themes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, usersApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { Sun, Moon, Monitor, Loader2, LogOut, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";


const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
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

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const initial = (user?.user_metadata?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();
  const role = user?.user_metadata?.role as string | undefined;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">My Profile</h1>
        <p className="mt-1 text-muted-foreground">Your account details and preferences</p>
      </div>

      <Card className="bg-surface shadow-sm border-outline-variant/20">
        <CardContent className="space-y-6 p-8">
          <div className="flex items-center gap-5">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {initial}
            </div>
            <div>
              <p className="font-display text-xl font-semibold">{user?.user_metadata?.name as string ?? user?.email}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {role && <p className="text-xs text-muted-foreground">Role: {role}</p>}
            </div>
          </div>

          <form onSubmit={handleSubmit(saveProfile)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-bold text-muted-foreground">Display Name</Label>
              <div className="flex gap-3">
                <Input
                  id="name"
                  {...register("name")}
                  className="flex-1 bg-surface-container-low border-outline-variant/50"
                />
                {isDirty && (
                  <Button type="submit" className="rounded-xl">
                    <User className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                )}
              </div>
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </form>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-muted-foreground">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={user?.email ?? ""} disabled className="bg-surface-container-low border-outline-variant/50 pl-10" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface shadow-sm border-outline-variant/20">
        <CardContent className="p-8 space-y-4">
          <h2 className="font-display text-xl font-bold">Theme</h2>
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
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-4 py-3 text-sm transition hover:bg-secondary-container",
                  theme === value && "border-primary bg-secondary-container font-semibold",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface shadow-sm border-outline-variant/20">
        <CardContent className="p-8 space-y-6">
          <h2 className="font-display text-xl font-bold">Notification Preferences</h2>
          <SwitchRow
            label="Meeting Reminder Email"
            description="Get a reminder before your scheduled meetings"
            checked={prefs?.meeting_reminder_email ?? true}
            onChange={(v) => updatePrefs.mutate({ meeting_reminder_email: v })}
          />
          <SwitchRow
            label="Outcome Prompt Email"
            description="Receive a prompt to log outcomes after a meeting"
            checked={prefs?.outcome_prompt_email ?? true}
            onChange={(v) => updatePrefs.mutate({ outcome_prompt_email: v })}
          />
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={handleSignOut}
        className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
