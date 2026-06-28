"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { formatDuration } from "@/lib/utils";

interface ScheduleEditorProps {
  scheduledAt: string | null | undefined;
  scheduledDuration: number;
  onSave: (patch: { scheduled_at?: string; scheduled_duration?: number }) => Promise<void>;
  disabled?: boolean;
}

interface ScheduleCreateEditorProps {
  date: string | undefined;
  time: string | undefined;
  duration: string | undefined;
  todayStr: string;
  timeMin: string | undefined;
  onSave: (date: string, time: string, duration: string) => void;
}

interface DateEditorProps {
  value: string | null | undefined;
  label: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ScheduleCreateEditor({ date, time, duration, todayStr, timeMin, onSave }: ScheduleCreateEditorProps) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(date ?? todayStr);
  const [t, setT] = useState(time ?? "09:00");
  const [dur, setDur] = useState(duration ?? "30");

  function openDialog() {
    setD(date ?? todayStr);
    setT(time ?? "09:00");
    setDur(duration ?? "30");
    setOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openDialog}>
          <Calendar className="mr-1.5 h-4 w-4" />
          {date ? `${date} at ${time}` : "Set date & time"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={openDialog}>
          <Clock className="mr-1.5 h-4 w-4" />
          {dur} min
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Schedule</DialogTitle>
            <DialogDescription>Choose the date, time, and duration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={d} onChange={(e) => setD(e.target.value)} min={todayStr} />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" min={timeMin} value={t} onChange={(e) => setT(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={1} value={dur} onChange={(e) => setDur(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(d, t, dur); setOpen(false); }} disabled={!d}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ScheduleEditor({ scheduledAt, scheduledDuration, onSave, disabled }: ScheduleEditorProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [saving, setSaving] = useState(false);

  function openDialog() {
    const dt = scheduledAt ? new Date(scheduledAt) : new Date();
    setDate(dt.toISOString().slice(0, 10));
    setTime(dt.toTimeString().slice(0, 5));
    setDuration(String(Math.round(scheduledDuration / 60)));
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (date) patch.scheduled_at = new Date(`${date}T${time || "09:00"}`).toISOString();
      const dur = parseInt(duration, 10);
      if (dur > 0) patch.scheduled_duration = dur * 60;
      await onSave(patch);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {disabled ? (
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{formatDuration(scheduledDuration)}</p>
          </div>
          {scheduledAt && (
            <div>
              <p className="text-muted-foreground">Scheduled</p>
              <p className="font-medium">{format(new Date(scheduledAt), "MMM d, yyyy h:mm a")}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Schedule</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openDialog}>
              <Clock className="mr-1.5 h-4 w-4" />
              {formatDuration(scheduledDuration)}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openDialog}>
              <Calendar className="mr-1.5 h-4 w-4" />
              {scheduledAt ? format(new Date(scheduledAt), "MMM d, yyyy h:mm a") : "Set date & time"}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>Update the date, time, and duration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !date}>
              {saving && <span className="mr-2 animate-spin">&#9696;</span>}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DateEditor({ value, label, onChange, disabled }: DateEditorProps) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(value ?? "");

  function openDialog() {
    setD(value ?? "");
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog} disabled={disabled}>
        <Calendar className="mr-1.5 h-4 w-4" />
        {value ? format(new Date(value), "MMM d, yyyy") : `Set ${label}`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>Choose a date.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onChange(d); setOpen(false); }} disabled={!d}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
