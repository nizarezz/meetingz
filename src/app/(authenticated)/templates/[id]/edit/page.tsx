"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTemplate, useUpdateTemplate } from "@/lib/hooks/use-templates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AgendaForm } from "@/components/agenda-form";
import type { AgendaItem } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  department: z.string().optional(),
  meetingType: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: template, isLoading } = useTemplate(id);
  const updateTemplate = useUpdateTemplate();
  const { data: departments } = useDepartments();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      department: "",
      meetingType: "",
    },
  });

  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);

  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        description: template.description ?? "",
        department: template.department ?? "",
        meetingType: template.meeting_type ?? "",
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAgendaItems(
        template.agenda_items.length > 0
          ? template.agenda_items
          : [{ title: "", duration: 300 }],
      );
    }
  }, [template, reset]);

  function onSubmit(data: TemplateFormData) {
    const cleanAgenda = agendaItems.filter((a) => a.title.trim());
    if (cleanAgenda.length === 0) {
      toast.error("At least one agenda item is required");
      return;
    }

    updateTemplate.mutate(
      {
        id,
        patch: {
          name: data.name.trim(),
          description: data.description?.trim() || undefined,
          department: data.department || undefined,
          meeting_type: data.meetingType || undefined,
          agenda_items: cleanAgenda,
        },
      },
      {
        onSuccess: () => { toast.success("Template updated"); router.push("/templates"); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="rounded-xl border border-border p-6 space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    );
  }

  if (!template) {
    return <div className="grid min-h-[60vh] place-items-center"><p className="text-muted-foreground">Template not found</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/templates" className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="font-display text-3xl text-foreground">Edit Template</h1>
          <p className="mt-1 text-sm text-muted-foreground">{template.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Template Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" {...register("description")} rows={2} />
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
                <Label>Meeting Type</Label>
                <Input {...register("meetingType")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <AgendaForm items={agendaItems} onChange={setAgendaItems} />

        <Button type="submit" className="w-full" disabled={updateTemplate.isPending}>
          {updateTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </form>
    </div>
  );
}
