"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUsers, useApproveUser, useDeactivateUser, useInviteUser } from "@/lib/hooks/use-users";
import { useDepartments } from "@/lib/hooks/use-departments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Loader2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { UserRole } from "@/lib/types";
import { ADMIN_ROLES, SUPER_ADMIN_ROLES } from "@/lib/types";
import { useAuth } from "@/components/providers/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
  department: z.string().optional(),
  role: z.string(),
});

type InviteFormData = z.infer<typeof inviteSchema>;

const PER_PAGE = 20;

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const { role } = useAuth();
  const { data, isLoading } = useUsers({ page, perPage: PER_PAGE });
  const { data: departments } = useDepartments();
  const approveUser = useApproveUser();
  const deactivateUser = useDeactivateUser();
  const inviteUser = useInviteUser();

  const users = data?.data;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "", department: "", role: "member" },
  });

  const [open, setOpen] = useState(false);

  function onSubmit(data: InviteFormData) {
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
          setOpen(false);
          reset({ email: "", name: "", department: "", role: "member" });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} total users</p>
        </div>
        {ADMIN_ROLES.includes(role as UserRole) && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <Button><Plus className="mr-2 h-4 w-4" /> Invite User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input {...register("email")} type="email" placeholder="user@company.com" />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
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
                            <SelectItem value="super_admin">Super Admin</SelectItem>
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

      <Card>
        <CardContent className="p-0">
          {!users || users.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No users found</p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{u.name ?? u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={SUPER_ADMIN_ROLES.includes(u.role as UserRole) ? "default" : ADMIN_ROLES.includes(u.role as UserRole) ? "secondary" : "outline"}>
                      {u.role}
                    </Badge>
                    {u.department && <Badge variant="outline">{u.department}</Badge>}
                    {u.is_approved ? (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Approved</Badge>
                    ) : ADMIN_ROLES.includes(role as UserRole) ? (
                      <Button size="sm" variant="outline" onClick={() => approveUser.mutate(u.id)}>
                        <Check className="mr-1 h-3 w-3" /> Approve
                      </Button>
                    ) : null}
                    {SUPER_ADMIN_ROLES.includes(role as UserRole) && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Deactivate this user?")) deactivateUser.mutate(u.id); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
