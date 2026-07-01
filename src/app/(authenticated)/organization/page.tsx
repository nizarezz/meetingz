"use client";

import { useState } from "react";
import Link from "next/link";
import { useTeam, useUpdateTeam } from "@/lib/hooks/use-teams";
import { useUsers, useApproveUser, useDeactivateUser, useInviteUser } from "@/lib/hooks/use-users";
import { useTemplates, useDeleteTemplate } from "@/lib/hooks/use-templates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom } from "@/lib/hooks/use-rooms";
import { useAuth } from "@/components/providers/auth-provider";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, departmentsApi } from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building2, Users, FileText, Plus, Loader2, Check, X,
  ChevronLeft, ChevronRight, Trash2, Save, DoorOpen,
} from "lucide-react";
import type { UserRole } from "@/lib/types";
import { ADMIN_ROLES, SUPER_ADMIN_ROLES } from "@/lib/types";
import { format } from "date-fns";
import { getErrorMsg } from "@/lib/utils";

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
  const qc = useQueryClient();
  const [usersPageNum, setUsersPageNum] = useState(1);
  const { data: team, isLoading: teamLoading } = useTeam();
  const { data: usersPage, isLoading: usersLoading } = useUsers({ page: usersPageNum, perPage: PER_PAGE });
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: departments } = useDepartments();
  const { data: rooms } = useRooms();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();
  const updateTeam = useUpdateTeam();
  const approveUser = useApproveUser();
  const deactivateUser = useDeactivateUser();
  const inviteUser = useInviteUser();
  const deleteTemplate = useDeleteTemplate();

  const createDepartment = useMutation({
    mutationFn: (name: string) => departmentsApi.create(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast.success("Department added"); },
    onError: async (e) => toast.error(await getErrorMsg(e)),
  });

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
        onError: async (err) => toast.error(await getErrorMsg(err)),
      },
    );
  }

  function handleDeleteTemplate(id: string, name: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTemplateToDelete({ id, name });
  }

  const isAdmin = ADMIN_ROLES.includes(role as UserRole);
  const isSuperAdmin = SUPER_ADMIN_ROLES.includes(role as UserRole);
  const [orgTab, setOrgTab] = useState("overview");
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);

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

      {/* Tabs */}
      <div className="flex gap-8 border-b border-outline-variant/40">
        <button onClick={() => setOrgTab("overview")} className={`pb-3 text-lg font-semibold transition-colors relative ${orgTab === "overview" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>Overview</button>
        {isAdmin && <button onClick={() => setOrgTab("members")} className={`pb-3 text-lg font-semibold transition-colors relative ${orgTab === "members" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>Members</button>}
        {isAdmin && <button onClick={() => setOrgTab("templates")} className={`pb-3 text-lg font-semibold transition-colors relative ${orgTab === "templates" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>Templates</button>}
      </div>

      {/* ── Overview Tab ── */}
        {orgTab === "overview" && <div className="mt-8 space-y-8">
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
                <DoorOpen className="h-8 w-8 text-primary" />
                <p className="font-display text-3xl font-bold">{rooms?.filter((r) => r.is_active)?.length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Rooms</p>
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

          <Card className="bg-surface shadow-sm border-outline-variant/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Building2 className="h-5 w-5 text-primary" />
                Departments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {departments?.length ? departments.map((d) => (
                  <Badge key={d} variant="outline" className="px-3 py-1">{d}</Badge>
                )) : (
                  <p className="text-sm text-muted-foreground">No departments yet</p>
                )}
              </div>
              {isAdmin && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const name = fd.get("dept-name") as string;
                    if (name?.trim()) createDepartment.mutate(name.trim());
                    e.currentTarget.reset();
                  }}
                  className="flex gap-2"
                >
                  <Input name="dept-name" placeholder="New department name" className="flex-1 h-9" required />
                  <Button type="submit" size="sm" className="h-9" disabled={createDepartment.isPending}>
                    {createDepartment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="bg-surface shadow-sm border-outline-variant/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <DoorOpen className="h-5 w-5 text-primary" />
                Rooms / Halls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {rooms?.length ? rooms.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Badge variant={r.is_active ? "default" : "secondary"} className="px-3 py-1">
                      {r.name}
                    </Badge>
                    {isAdmin && r.is_active && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { if (confirm(`Deactivate room "${r.name}"?`)) updateRoom.mutate({ id: r.id, patch: { is_active: false } }, { onError: async (e) => toast.error(await getErrorMsg(e)) }); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    {isSuperAdmin && !r.is_active && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => updateRoom.mutate({ id: r.id, patch: { is_active: true } }, { onError: async (e) => toast.error(await getErrorMsg(e)) })}>
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No rooms yet</p>
                )}
              </div>
              {isAdmin && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const name = fd.get("room-name") as string;
                    if (name?.trim()) createRoom.mutate(name.trim(), { onError: async (e) => toast.error(await getErrorMsg(e)) });
                    e.currentTarget.reset();
                  }}
                  className="flex gap-2"
                >
                  <Input name="room-name" placeholder="New room name" className="flex-1 h-9" required />
                  <Button type="submit" size="sm" className="h-9" disabled={createRoom.isPending}>
                    {createRoom.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>}

        {/* ── Members Tab ── */}
        {orgTab === "members" && <div className="mt-8 space-y-6">
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
                        {isSuperAdmin ? (
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => {
                              usersApi.changeRole(u.id, newRole as UserRole).then(() => {
                                toast.success(`Role changed to ${newRole}`);
                                qc.invalidateQueries({ queryKey: ["users"] });
                              }).catch(async (e) => toast.error(await getErrorMsg(e)));
                            }}
                          >
                            <SelectTrigger className="h-7 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="dept_admin">Dept Admin</SelectItem>
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={
                            SUPER_ADMIN_ROLES.includes(u.role as UserRole) ? "default" :
                            ADMIN_ROLES.includes(u.role as UserRole) ? "secondary" : "outline"
                          }>
                            {u.role}
                          </Badge>
                        )}
                        {u.department && <Badge variant="outline">{u.department}</Badge>}
                        {u.is_approved ? (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Approved</Badge>
                        ) : isAdmin ? (
                          <Button size="sm" variant="outline" onClick={() => approveUser.mutate(u.id, { onError: async (e) => toast.error(await getErrorMsg(e)) })}>
                            <Check className="mr-1 h-3 w-3" /> Approve
                          </Button>
                        ) : null}
                        {(isSuperAdmin || (isAdmin && !ADMIN_ROLES.includes(u.role as UserRole))) && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Deactivate this user?")) deactivateUser.mutate(u.id, { onError: async (e) => toast.error(await getErrorMsg(e)) }); }}>
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
        </div>}

        {/* ── Templates Tab ── */}
        {orgTab === "templates" && <div className="mt-8 space-y-6">
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
                            onClick={(e) => handleDeleteTemplate(t.id, t.name, e)}
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
        </div>}

      <Dialog open={!!templateToDelete} onOpenChange={(v) => { if (!v) setTemplateToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{templateToDelete?.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTemplateToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (!templateToDelete) return;
              deleteTemplate.mutate(templateToDelete.id, {
                onSuccess: () => { toast.success("Template deleted"); setTemplateToDelete(null); },
                onError: (err) => { toast.error(err.message); setTemplateToDelete(null); },
              });
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
