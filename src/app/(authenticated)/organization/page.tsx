"use client";

import { useState } from "react";
import Link from "next/link";
import { useTeam, useUpdateTeam } from "@/lib/hooks/use-teams";
import { useUsers, useApproveUser, useDeactivateUser, useInviteUser } from "@/lib/hooks/use-users";
import { useTemplates, useDeleteTemplate } from "@/lib/hooks/use-templates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useAuth } from "@/components/providers/auth-provider";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building2, Users, FileText, Plus, Loader2, Check, X,
  ChevronLeft, ChevronRight, Trash2, Save,
} from "lucide-react";
import type { UserRole } from "@/lib/types";
import { ADMIN_ROLES, SUPER_ADMIN_ROLES } from "@/lib/types";
import { format } from "date-fns";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
  department: z.string().optional(),
  role: z.string(),
});

type InviteFormData = z.infer<typeof inviteSchema>;

const PER_PAGE = 20;

export default function OrganizationPage() {
  const { role } = useAuth();
  const [usersPageNum, setUsersPageNum] = useState(1);
  const { data: team, isLoading: teamLoading } = useTeam();
  const { data: usersPage, isLoading: usersLoading } = useUsers({ page: usersPageNum, perPage: PER_PAGE });
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: departments } = useDepartments();
  const updateTeam = useUpdateTeam();
  const approveUser = useApproveUser();
  const deactivateUser = useDeactivateUser();
  const inviteUser = useInviteUser();
  const deleteTemplate = useDeleteTemplate();

  const [teamName, setTeamName] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const {
    register, handleSubmit, control, reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "", department: "", role: "member" },
  });

  // teamName state initialized inline — no effect needed

  const users = usersPage?.data ?? [];
  const totalUsers = usersPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalUsers / PER_PAGE));

  function handleSaveTeam() {
    if (!teamName.trim()) return;
    updateTeam.mutate({ name: teamName.trim() }, {
      onSuccess: () => toast.success("Team name updated"),
      onError: (err) => toast.error(err.message),
    });
  }

  function onInvite(data: InviteFormData) {
    inviteUser.mutate(
      {
        email: data.email.trim(),
        name: data.name?.trim() || undefined,
        department: data.department || undefined,
        role: data.role as UserRole,
      },
      {
        onSuccess: () => {
          toast.success("Invitation sent");
          setInviteOpen(false);
          reset({ email: "", name: "", department: "", role: "member" });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDeleteTemplate(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Delete this template?")) {
      deleteTemplate.mutate(id, {
        onSuccess: () => toast.success("Template deleted"),
        onError: (err) => toast.error(err.message),
      });
    }
  }

  const isAdmin = ADMIN_ROLES.includes(role as UserRole);
  const isSuperAdmin = SUPER_ADMIN_ROLES.includes(role as UserRole);

  if (teamLoading || usersLoading || templatesLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-80 rounded-lg" />
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Organization</h1>
        <p className="mt-1 text-muted-foreground">Manage your team, members, and templates</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="gap-6 bg-transparent border-b border-outline-variant/40 rounded-none p-0 h-auto">
          <TabsTrigger value="overview" className="pb-3 text-lg font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent shadow-none px-0 data-[state=active]:shadow-none">
            Overview
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="members" className="pb-3 text-lg font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent shadow-none px-0 data-[state=active]:shadow-none">
              Members
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="templates" className="pb-3 text-lg font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent shadow-none px-0 data-[state=active]:shadow-none">
              Templates
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="mt-8 space-y-8">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="bg-surface shadow-sm border-outline-variant/20">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <Users className="h-8 w-8 text-primary" />
                <p className="font-display text-3xl font-bold">{totalUsers}</p>
                <p className="text-sm text-muted-foreground">Members</p>
              </CardContent>
            </Card>
            <Card className="bg-surface shadow-sm border-outline-variant/20">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <FileText className="h-8 w-8 text-primary" />
                <p className="font-display text-3xl font-bold">{templates?.length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Templates</p>
              </CardContent>
            </Card>
            <Card className="bg-surface shadow-sm border-outline-variant/20">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <Building2 className="h-8 w-8 text-primary" />
                <p className="font-display text-3xl font-bold">{team ? 1 : 0}</p>
                <p className="text-sm text-muted-foreground">Workspace</p>
              </CardContent>
            </Card>
          </div>

          {team && (
            <Card className="bg-surface shadow-sm border-outline-variant/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="h-5 w-5 text-primary" />
                  {isSuperAdmin ? "Workspace Name" : team.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSuperAdmin ? (
                  <div className="flex gap-3">
                    <Input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Workspace name"
                      className="flex-1 bg-surface-container-low"
                    />
                    <Button onClick={handleSaveTeam} disabled={updateTeam.isPending}>
                      {updateTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{team.name}</p>
                )}
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span>Created {format(new Date(team.created_at), "MMM d, yyyy")}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Members Tab ── */}
        <TabsContent value="members" className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-lg text-muted-foreground">{totalUsers} total members</p>
            {isAdmin && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger render={<Button><Plus className="mr-2 h-4 w-4" /> Invite</Button>} />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Member</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit(onInvite)} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input {...register("email")} type="email" placeholder="user@company.com" />
                      {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Name (optional)</Label>
                      <Input {...register("name")} placeholder="Full name" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Controller
                          name="department"
                          control={control}
                          render={({ field }) => (
                            <Select value={field.value ?? ""} onValueChange={(v) => v && field.onChange(v)}>
                              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {departments?.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Controller
                          name="role"
                          control={control}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="dept_admin">Dept Admin</SelectItem>
                                {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={inviteUser.isPending}>
                      {inviteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send Invitation
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {users.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-16">
                <Users className="h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium text-muted-foreground">No members yet</p>
                {isAdmin && <Button onClick={() => setInviteOpen(true)}>Invite your first member</Button>}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-surface shadow-sm border-outline-variant/20">
              <CardContent className="p-0">
                <div className="divide-y divide-outline-variant/20">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-6 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{u.name ?? u.email}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={
                          SUPER_ADMIN_ROLES.includes(u.role as UserRole) ? "default" :
                          ADMIN_ROLES.includes(u.role as UserRole) ? "secondary" : "outline"
                        }>
                          {u.role}
                        </Badge>
                        {u.department && <Badge variant="outline">{u.department}</Badge>}
                        {u.is_approved ? (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Approved</Badge>
                        ) : isAdmin ? (
                          <Button size="sm" variant="outline" onClick={() => approveUser.mutate(u.id)}>
                            <Check className="mr-1 h-3 w-3" /> Approve
                          </Button>
                        ) : null}
                        {(isSuperAdmin || (isAdmin && !ADMIN_ROLES.includes(u.role as UserRole))) && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Deactivate this user?")) deactivateUser.mutate(u.id); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-outline-variant/20">
                    <p className="text-sm text-muted-foreground">
                      Page {usersPageNum} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={usersPageNum <= 1} onClick={() => setUsersPageNum((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-4 w-4" /> Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={usersPageNum >= totalPages} onClick={() => setUsersPageNum((p) => p + 1)}>
                        Next <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Templates Tab ── */}
        <TabsContent value="templates" className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-lg text-muted-foreground">{templates?.length ?? 0} templates</p>
            {isAdmin && (
              <Link href="/templates/new">
                <Button><Plus className="mr-2 h-4 w-4" /> New Template</Button>
              </Link>
            )}
          </div>

          {!templates || templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-16">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium text-muted-foreground">No templates yet</p>
                {isAdmin && <Link href="/templates/new"><Button>Create your first template</Button></Link>}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <Link key={t.id} href={`/templates/${t.id}/edit`}>
                  <Card className="bg-surface shadow-sm border-outline-variant/20 cursor-pointer transition hover:border-primary/50 h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={(e) => handleDeleteTemplate(t.id, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {t.description && (
                        <p className="text-muted-foreground line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {t.department && <Badge variant="secondary">{t.department}</Badge>}
                        {t.meeting_type && <Badge variant="outline">{t.meeting_type}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.agenda_items?.length ?? 0} agenda items
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
