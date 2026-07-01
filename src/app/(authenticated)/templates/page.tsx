"use client";

import { useState } from "react";
import Link from "next/link";
import { useTemplates, useDeleteTemplate } from "@/lib/hooks/use-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { SUPER_ADMIN_ROLES } from "@/lib/types";
import type { UserRole } from "@/lib/types";

export default function TemplatesPage() {
  const { role } = useAuth();
  const { data: templates, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-8 w-20 rounded-full" />
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
          <h1 className="font-display text-3xl text-foreground">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {templates?.length ?? 0} templates
          </p>
        </div>
        <Link href="/templates/new" className={buttonVariants({})}>
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Link>
      </div>

      {!templates || templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">No templates yet</p>
            <Link href="/templates/new" className={buttonVariants({})}>Create your first template</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Link key={t.id} href={`/templates/${t.id}/edit`}>
              <Card className="cursor-pointer transition hover:shadow-md h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    {SUPER_ADMIN_ROLES.includes(role as UserRole) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTemplateToDelete({ id: t.id, name: t.name }); }}
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
