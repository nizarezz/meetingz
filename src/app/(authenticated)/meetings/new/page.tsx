"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateMeeting } from "@/lib/hooks/use-meetings";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useTemplates } from "@/lib/hooks/use-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { AgendaForm } from "@/components/agenda-form";
import type { AgendaItem } from "@/lib/types";

const meetingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  department: z.string().optional(),
  meetingType: z.string().optional(),
  scheduledAt: z.string().optional(),
  vibe: z.string().optional(),
});

type MeetingFormData = z.infer<typeof meetingSchema>;

export default function NewMeetingPage() {
  const router = useRouter();
  const createMeeting = useCreateMeeting();
  const { data: departments } = useDepartments();
  const { data: templates } = useTemplates();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      title: "",
      department: "",
      meetingType: "",
      scheduledAt: "",
      vibe: "",
    },
  });

  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([
    { title: "", duration: 300 },
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  function applyTemplate(templateId: string | null) {
    if (!templateId) return;
    const tpl = templates?.find((t) => t.id === templateId);
    if (!tpl) return;
    setValue("title", tpl.name);
    if (tpl.department) setValue("department", tpl.department);
    if (tpl.meeting_type) setValue("meetingType", tpl.meeting_type);
    setAgendaItems(tpl.agenda_items.map((a) => ({ ...a })));
    setSelectedTemplate(templateId);
  }

  function onSubmit(data: MeetingFormData) {
    const cleanAgenda = agendaItems.filter((a) => a.title.trim());
    if (cleanAgenda.length === 0) {
      toast.error("At least one agenda item is required");
      return;
    }

    const totalDuration = cleanAgenda.reduce((sum, a) => sum + a.duration, 0);

    createMeeting.mutate(
      {
        title: data.title.trim(),
        department: data.department ?? "",
        meeting_type: data.meetingType ?? "",
        scheduled_duration: totalDuration,
        scheduled_at: data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined,
        vibe: data.vibe?.trim() || undefined,
        agenda_items: cleanAgenda,
      },
      {
        onSuccess: (meeting) => {
          toast.success("Meeting created");
          router.push(`/meetings/${meeting.id}`);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/meetings" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-3xl text-foreground">New Meeting</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan your focused session</p>
        </div>
      </div>

      {templates && templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Start from Template</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplate} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Meeting Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                {...register("title")}
                placeholder="e.g. Sprint Planning"
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
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
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Meeting Type</Label>
                <Input
                  id="type"
                  {...register("meetingType")}
                  placeholder="e.g. Standup, Review"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Schedule (optional)</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                {...register("scheduledAt")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vibe">Vibe (optional)</Label>
              <Input
                id="vibe"
                {...register("vibe")}
                placeholder="e.g. Casual, Focused"
              />
            </div>
          </CardContent>
        </Card>

        <AgendaForm items={agendaItems} onChange={setAgendaItems} />

        <Button type="submit" className="w-full" disabled={createMeeting.isPending}>
          {createMeeting.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Meeting
        </Button>
      </form>
    </div>
  );
}
