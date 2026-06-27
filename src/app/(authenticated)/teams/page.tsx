"use client";

import { useState, useEffect } from "react";
import { useTeam, useUpdateTeam } from "@/lib/hooks/use-teams";
import { useUsers } from "@/lib/hooks/use-users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Users as UsersIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_ROLES, SUPER_ADMIN_ROLES } from "@/lib/types";
import type { UserRole } from "@/lib/types";

export default function TeamsPage() {
  const { role } = useAuth();
  const { data: team, isLoading: teamLoading, isError } = useTeam();
  const { data: usersPage } = useUsers();
  const users = usersPage?.data ?? [];
  const updateTeam = useUpdateTeam();
  const [teamName, setTeamName] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (team?.name) setTeamName(team.name);
  }, [team?.name]);

  function handleSave() {
    if (!teamName.trim()) return;
    updateTeam.mutate({ name: teamName.trim() }, {
      onSuccess: () => toast.success("Team name updated"),
      onError: (err) => toast.error(err.message),
    });
  }

  if (teamLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="rounded-xl border border-border p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !team) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl text-foreground">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your workspace</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <UsersIcon className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">No team assigned yet</p>
            <p className="text-sm text-muted-foreground">Refresh the page or contact support</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your workspace</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Name</Label>
            <div className="flex gap-3">
              <Input
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder={team?.name ?? "Enter team name"}
                className="flex-1"
                disabled={!SUPER_ADMIN_ROLES.includes(role as UserRole)}
              />
              {SUPER_ADMIN_ROLES.includes(role as UserRole) && (
                <Button onClick={handleSave} disabled={updateTeam.isPending}>
                  {updateTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" /> Members ({users?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!users || users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="font-medium">{u.name ?? u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={SUPER_ADMIN_ROLES.includes(u.role as UserRole) ? "default" : ADMIN_ROLES.includes(u.role as UserRole) ? "secondary" : "outline"}>
                      {u.role}
                    </Badge>
                    {u.department && (
                      <Badge variant="outline">{u.department}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
