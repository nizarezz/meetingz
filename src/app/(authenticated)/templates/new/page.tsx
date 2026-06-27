"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTemplate } from "@/lib/hooks/use-templates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AgendaForm } from "@/components/agenda-form";
import type { AgendaItem } from "@/lib/types";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  department: z.string().optional(),
  meetingType: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export default function NewTemplatePage() {
  const router = useRouter();
  const createTemplate = useCreateTemplate();
  const { data: departments } = useDepartments();

  const {
    register,
    handleSubmit,
    control,
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

  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([
    { title: "", duration: 300 },
  ]);

  function onSubmit(data: TemplateFormData) {
    const cleanAgenda = agendaItems.filter((a) => a.title.trim());
    if (cleanAgenda.length === 0) {
      toast.error("At least one agenda item is required");
      return;
    }

    createTemplate.mutate(
      {
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        department: data.department || undefined,
        meeting_type: data.meetingType || undefined,
        agenda_items: cleanAgenda,
      },
      {
        onSuccess: () => {
          toast.success("Template created");
          router.push("/templates");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">New Template</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a reusable meeting template</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} placeholder="e.g. Sprint Planning" />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea id="desc" {...register("description")} placeholder="Brief description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dept">Department</Label>
                <Controller
                  name="department"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger id="dept">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {departments?.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Meeting Type</Label>
                <Input id="type" {...register("meetingType")} placeholder="e.g. Standup" />
              </div>
            </div>
          </CardContent>
        </Card>

        <AgendaForm items={agendaItems} onChange={setAgendaItems} />

        <Button type="submit" className="w-full" disabled={createTemplate.isPending}>
          {createTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Template
        </Button>
      </form>
    </div>
  );
}
