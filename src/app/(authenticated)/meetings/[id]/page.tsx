"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMeeting, useUpdateMeeting, useDeleteMeeting } from "@/lib/hooks/use-meetings";
import { useAuth } from "@/components/providers/auth-provider";
import { useUser } from "@/lib/hooks/use-users";
import { useTimer, useStartTimer, usePauseTimer, useResumeTimer, useNextItem, useResetTimer, useEndTimer, useElapsedTime } from "@/lib/hooks/use-timer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { outcomesApi, commentsApi, usersApi, outcomeNotesApi } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import { AssigneePicker } from "@/components/assignee-picker";
import { ScheduleEditor, DateEditor } from "@/components/schedule-editor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRealtimeInvalidation } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Play, Pause, SkipForward, RotateCcw, Timer as TimerIcon, CheckSquare, Plus, Trash2, Printer, Loader2, MessageSquare, Send, Share2, QrCode, FileText, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { PrimaryOutcome, ActionItem, Comment as CommentType } from "@/lib/types";
import { formatDuration, getErrorMsg, appUrl } from "@/lib/utils";
import { MEETING_STATUS_BADGE, SUPER_ADMIN_ROLES } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import { ADMIN_ROLES } from "@/lib/types";
import QRCode from "qrcode";
import { Skeleton } from "@/components/ui/skeleton";

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: meeting, isLoading } = useMeeting(id);
  const { data: timer } = useTimer(id);
  const updateMeeting = useUpdateMeeting();
  const startTimer = useStartTimer();
  const pauseTimer = usePauseTimer();
  const resumeTimer = useResumeTimer();
  const nextItem = useNextItem();
  const resetTimer = useResetTimer();
  const endTimer = useEndTimer();
  const { user, role } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(role as UserRole);
  const isSuperAdmin = SUPER_ADMIN_ROLES.includes(role as UserRole);
  const isHost = meeting?.facilitator_id === user?.id || meeting?.created_by === user?.id;
  const canEdit = isHost || isSuperAdmin;
  const { data: currentUser } = useUser(user?.id ?? "");
  const { data: conflictMeetings } = useQuery({
    queryKey: ["detail-room-conflict", meeting?.room_id, meeting?.scheduled_at, meeting?.scheduled_duration],
    queryFn: async () => {
      if (!meeting?.room_id || !meeting?.scheduled_at) return [];
      const startTime = new Date(meeting.scheduled_at).getTime();
      const endTime = startTime + meeting.scheduled_duration * 1000;
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, scheduled_at, scheduled_duration")
        .eq("room_id", meeting.room_id)
        .is("deleted_at", null)
        .not("status", "eq", "cancelled")
        .lt("scheduled_at", new Date(endTime).toISOString());
      if (error) { console.error("detail room conflict error", error); return []; }
      return (data ?? []).filter((m) => {
        if (m.id === meeting.id) return false;
        const mEnd = new Date(m.scheduled_at).getTime() + m.scheduled_duration * 1000;
        return mEnd > startTime;
      });
    },
    enabled: !!meeting?.room_id && !!meeting?.scheduled_at,
  });
  const deleteMeeting = useDeleteMeeting();
  const router = useRouter();

  // Timer live counting
  const { total: totalToShow, item: itemToShow } = useElapsedTime(timer);

  // Outcome form
  const { data: existingOutcome } = useQuery({
    queryKey: ["outcomes", id],
    queryFn: () => outcomesApi.get(id),
    enabled: !!meeting,
  });

  const [primaryOutcome, setPrimaryOutcome] = useState<PrimaryOutcome>("Decision Made");
  const [actionItems, setActionItems] = useState<ActionItem[]>([{ text: "", assignee_email: "", due_date: "" }]);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [hostSearch, setHostSearch] = useState("");
  useRealtimeInvalidation([
    { channel: "meeting-detail-meeting", table: "meetings", events: ["UPDATE"], filter: `id=eq.${id}`, queryKeys: [["meetings", id], ["timer", id], ["meetings"]] },
    { channel: "meeting-detail-timer", table: "meeting_timer_state", events: ["*"], filter: `meeting_id=eq.${id}`, queryKeys: [["timer", id]] },
    { channel: "meeting-detail-outcomes", table: "outcomes", events: ["UPDATE"], filter: `meeting_id=eq.${id}`, queryKeys: [["outcomes", id], ["outcomes"]] },
    { channel: "meeting-detail-comments", table: "comments", events: ["INSERT"], filter: `meeting_id=eq.${id}`, queryKeys: [["comments", id]] },
  ]);

  const [commentText, setCommentText] = useState("");

  const { data: comments } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => commentsApi.list(id),
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: (text: string) => commentsApi.add(id, text),
    onSuccess: () => {
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["comments", id] });
    },
    onError: async (e) => toast.error(await getErrorMsg(e)),
  });

  const userComment = comments?.data?.find((c) => c.user_id === user?.id);

  const outcomeId = existingOutcome?.id;

  const { data: outcomeNotes } = useQuery({
    queryKey: ["outcome-notes", outcomeId],
    queryFn: () => outcomeNotesApi.list(outcomeId!),
    enabled: !!outcomeId,
  });

  const existingNote = outcomeNotes?.find(n => n.source === "manual");

  const [outcomeNoteText, setOutcomeNoteText] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (existingNote) setOutcomeNoteText(existingNote.text);
  }, [existingNote]);

  useEffect(() => {
    if (existingOutcome) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrimaryOutcome((existingOutcome.primary_outcome as PrimaryOutcome) ?? "Decision Made");
      setActionItems(existingOutcome.action_items?.length ? existingOutcome.action_items : [{ text: "", assignee_email: "", due_date: "" }]);
    }
  }, [existingOutcome]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        primary_outcome: primaryOutcome as PrimaryOutcome,
        action_items: actionItems.filter((a) => a.text.trim()),
      };
      const saved = existingOutcome
        ? await outcomesApi.update(id, body)
        : await outcomesApi.create(id, body);

      if (outcomeNoteText.trim() && saved.id) {
        if (existingNote) {
          await outcomeNotesApi.update(existingNote.id, outcomeNoteText.trim());
        } else {
          await outcomeNotesApi.create({
            meeting_id: id,
            outcome_id: saved.id,
            text: outcomeNoteText.trim(),
            sort_order: 0,
            source: "manual",
          });
        }
      }

      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outcomes", id] });
      qc.invalidateQueries({ queryKey: ["meetings", id] });
      qc.invalidateQueries({ queryKey: ["outcome-notes"] });
      toast.success("Outcome saved");
    },
    onError: async (e) => toast.error(await getErrorMsg(e)),
  });

  function addActionItem() {
    setActionItems((prev) => [...prev, { text: "", assignee_email: "", due_date: "" }]);
  }
  function removeActionItem(index: number) {
    setActionItems((prev) => prev.filter((_, i) => i !== index));
  }
  function updateActionItem(index: number, field: keyof ActionItem, value: string | boolean) {
    setActionItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteIndex, setInviteIndex] = useState(-1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: ({ email, name }: { email: string; name?: string }) =>
      usersApi.invite({ email, name, role: "member" }),
  });

  function handleInvite(email: string, name?: string) {
    setInviteEmail(email);
    setInviteName(name ?? email.split("@")[0]);
    setInviteOpen(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-border p-6 space-y-4">
              <Skeleton className="h-6 w-16" />
              <div className="flex justify-center">
                <Skeleton className="h-16 w-32" />
              </div>
              <div className="flex justify-center gap-3">
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-14 w-14 rounded-full" />
              </div>
            </div>
            <div className="rounded-xl border border-border p-6 space-y-3">
              <Skeleton className="h-6 w-20" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border p-6 space-y-3">
            <Skeleton className="h-6 w-20" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <p className="text-muted-foreground">Meeting not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/meetings" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl text-foreground">{meeting.title}</h1>
            <Badge variant={MEETING_STATUS_BADGE[meeting.status] ?? "outline"}>
              {meeting.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {meeting.department} &middot; {meeting.meeting_type}
            {meeting.room && ` &middot; ${meeting.room.name}`}
            {meeting.scheduled_at && ` &middot; ${format(new Date(meeting.scheduled_at), "MMM d, yyyy h:mm a")}`}
          </p>
          <p className="text-sm text-muted-foreground">
            Host: {meeting.facilitator?.name ?? meeting.facilitator?.email ?? meeting.creator?.name ?? meeting.creator?.email ?? "Unassigned"}
            {(meeting.facilitator_id === user?.id || meeting.created_by === user?.id) && (
              <Button variant="link" size="sm" className="h-auto px-1 text-xs" onClick={() => setShowHostPicker(true)}>
                Transfer
              </Button>
            )}
          </p>
        </div>
        {meeting.share_token && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const url = appUrl(`/live/${meeting.share_token}`);
                navigator.clipboard.writeText(url);
                toast.success("Live link copied to clipboard");
              }}
            >
              <Share2 className="h-4 w-4" /> Share Live
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setShowQr(true)}>
              <QrCode className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timer Section */}
          {(meeting.status === "planned" || meeting.status === "active") && timer && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TimerIcon className="h-5 w-5" /> Timer
                  {meeting && canEdit && (
                    <label className="ml-auto flex items-center gap-2 text-sm font-normal cursor-pointer">
                      <span className="text-muted-foreground">Open to admins</span>
                      <Switch
                        checked={meeting.timer_open_to_all ?? false}
                        onCheckedChange={(checked) => updateMeeting.mutate({ id, patch: { timer_open_to_all: checked } }, { onError: async (e) => toast.error(await getErrorMsg(e)) })}
                      />
                    </label>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-6xl font-mono font-bold tabular-nums tracking-tight">
                    {formatDuration(totalToShow)}
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    {totalToShow > meeting.scheduled_duration
                      ? `Over budget by ${formatDuration(totalToShow - meeting.scheduled_duration)}`
                      : `${formatDuration(meeting.scheduled_duration - totalToShow)} remaining`}
                  </p>
                </div>

                {timer.active_item && (
                  <div className="text-center text-sm text-muted-foreground border rounded-lg p-3">
                    <span className="font-medium text-foreground">Current: {timer.active_item.title}</span>
                    {timer.active_item.assignee_email && <span> &middot; {timer.active_item.assignee_email}</span>}
                    <br />
                    {formatDuration(itemToShow)} / {formatDuration(timer.active_item.duration)}
                  </div>
                )}

                {canEdit && (
                  <div className="flex justify-center gap-3">
                    {/* Start / Pause toggle */}
                    <Button
                      size="lg"
                      className={`h-14 w-14 rounded-full ${timer.is_running ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                      onClick={() => {
                        if (timer.is_running) {
                          pauseTimer.mutate(id, { onError: async (e) => toast.error(await getErrorMsg(e)) });
                        } else {
                          const fn = timer.paused_at ? resumeTimer.mutate : startTimer.mutate;
                          fn(id, { onError: async (e) => toast.error(await getErrorMsg(e)) });
                        }
                      }}
                      disabled={startTimer.isPending || pauseTimer.isPending || resumeTimer.isPending}
                    >
                      {(startTimer.isPending || pauseTimer.isPending || resumeTimer.isPending)
                        ? <Loader2 className="h-6 w-6 animate-spin" />
                        : timer.is_running
                          ? <Pause className="h-6 w-6" />
                          : <Play className="h-6 w-6 fill-current" />}
                    </Button>

                    {/* Skip */}
                    {meeting.agenda_items && timer.active_item_index < meeting.agenda_items.length - 1 && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 w-14 rounded-full"
                        onClick={() => nextItem.mutate(id, { onError: async (e) => toast.error(await getErrorMsg(e)) })}
                        disabled={nextItem.isPending}
                      >
                        {nextItem.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <SkipForward className="h-6 w-6" />}
                      </Button>
                    )}



                    {/* End & Log */}
                    <Button
                      size="lg"
                      variant="destructive"
                      className="h-14 rounded-full px-6"
                      onClick={() => endTimer.mutate(id, { onError: async (e) => toast.error(await getErrorMsg(e)) })}
                      disabled={endTimer.isPending}
                    >
                      {endTimer.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />}
                      End & Log
                    </Button>

                    {/* Reset (super admin only) */}
                    {SUPER_ADMIN_ROLES.includes(currentUser?.role as UserRole) && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 w-14 rounded-full"
                        onClick={() => resetTimer.mutate(id, { onError: async (e) => toast.error(await getErrorMsg(e)) })}
                        disabled={resetTimer.isPending}
                      >
                        {resetTimer.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <RotateCcw className="h-6 w-6" />}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Agenda Section */}
          <Card>
            <CardHeader>
              <CardTitle>Agenda</CardTitle>
            </CardHeader>
            <CardContent>
              {(!meeting.agenda_items || meeting.agenda_items.length === 0) ? (
                <p className="text-sm text-muted-foreground">No agenda items</p>
              ) : (
                <ol className="space-y-3">
                  {meeting.agenda_items.map((item, i) => (
                    <li key={i} className={`flex items-center gap-3 p-2 rounded-lg ${
                      timer && i === timer.active_item_index ? "bg-accent" : ""
                    }`}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${
                        timer && i === timer.active_item_index
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-primary"
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.title}</p>
                        {item.assignee_email && (
                          <p className="text-xs text-muted-foreground truncate">{item.assignee_email}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {formatDuration(item.duration)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Outcome Section */}
          {(meeting.status === "completed" || meeting.status === "logged" || meeting.status === "active") && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Primary Outcome</CardTitle>
                </CardHeader>
                <CardContent>
                  {canEdit ? (
                    <Select value={primaryOutcome} onValueChange={(v) => setPrimaryOutcome(v as PrimaryOutcome)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Decision Made">Decision Made</SelectItem>
                        <SelectItem value="Action Items Assigned">Action Items Assigned</SelectItem>
                        <SelectItem value="Postponed">Postponed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{primaryOutcome}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Action Items</CardTitle>
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={addActionItem}>
                      <Plus className="mr-1 h-3 w-3" /> Add
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {actionItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No action items</p>
                  ) : (
                    actionItems.map((item, i) => (
                      <div key={i} className="space-y-2 p-3 border rounded-lg">
                        {canEdit ? (
                          <>
                            <div className="flex items-start gap-2">
                              <Input
                                value={item.text}
                                onChange={(e) => updateActionItem(i, "text", e.target.value)}
                                placeholder="Task description"
                                className="flex-1"
                              />
                              {actionItems.length > 1 && (
                                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeActionItem(i)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <AssigneePicker
                                  value={item.assignee_email ?? ""}
                                  onChange={(v, userId) => {
                                    updateActionItem(i, "assignee_email", v);
                                    updateActionItem(i, "assignee_id", userId ?? "");
                                  }}
                                  onInvite={(email) => { setInviteIndex(i); handleInvite(email); }}
                                />
                              </div>
                              <div className="w-36">
                                <DateEditor
                                  value={item.due_date ?? ""}
                                  label="Due date"
                                  onChange={(v) => updateActionItem(i, "due_date", v)}
                                />
                              </div>
                              <Button
                                type="button"
                                variant={item.status === "done" ? "default" : "outline"}
                                size="icon"
                                className="shrink-0"
                                onClick={() => updateActionItem(i, "status", item.status === "done" ? "pending" : "done")}
                              >
                                <CheckSquare className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-start justify-between">
                            <div>
                              <p className={`text-sm ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                                {item.text}
                              </p>
                              {(item.assignee_email || item.due_date) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {item.assignee_email && <span>{item.assignee_email}</span>}
                                  {item.assignee_email && item.due_date && <span> · </span>}
                                  {item.due_date && <span>Due {item.due_date}</span>}
                                </p>
                              )}
                            </div>
                            {item.status === "done" && <CheckSquare className="h-4 w-4 text-emerald-500 shrink-0" />}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Outcome Notes Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Outcome Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {outcomeNotes && outcomeNotes.length > 0 ? (
                    outcomeNotes.map((n, i) => (
                      <div key={n.id ?? i} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-accent/30">
                        <div className="min-w-0">
                          <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{n.created_by_user?.name && <span>{n.created_by_user.name} · </span>}{format(new Date(n.created_at), "MMM d, h:mm a")}</p>
                        </div>
                        {(isSuperAdmin || isHost) && meeting.status !== "logged" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="shrink-0 h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              outcomeNotesApi.remove(n.id).then(() => {
                                qc.invalidateQueries({ queryKey: ["outcome-notes"] });
                                toast.success("Note removed");
                              }).catch(async (e) => toast.error(await getErrorMsg(e)));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No outcome notes yet</p>
                  )}

                  {(isSuperAdmin || isHost) && meeting.status !== "logged" && (
                    <Textarea
                      value={outcomeNoteText}
                      onChange={(e) => setOutcomeNoteText(e.target.value)}
                      placeholder="Add a note for the outcome..."
                      rows={3}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Comments Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Comments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments && comments.data.length > 0 && (
                <div className="space-y-3">
                  {comments.data.map((c: CommentType) => (
                    <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-accent/30">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(c.users?.name || "U")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{c.users?.name ?? "Unknown"}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.users?.role ?? "member"}</Badge>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                        </div>
                        <p className="mt-1 text-sm">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!comments?.data?.length && (
                <p className="text-sm text-muted-foreground">No comments yet</p>
              )}

              {userComment ? (
                <p className="text-sm text-muted-foreground">You already commented</p>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                        e.preventDefault();
                        addCommentMutation.mutate(commentText.trim());
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
                    disabled={!commentText.trim() || addCommentMutation.isPending}
                  >
                    {addCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ScheduleEditor
                scheduledAt={meeting.scheduled_at}
                scheduledDuration={meeting.scheduled_duration}
                onSave={async (patch) => {
                  await updateMeeting.mutateAsync({ id, patch });
                }}
                disabled={true}
              />
              <div>
                <p className="text-muted-foreground">Room</p>
                <p className="font-medium">{meeting.room?.name ?? "No room"}</p>
                {conflictMeetings && conflictMeetings.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-medium">Room conflict: </span>
                      {conflictMeetings.map((c, i) => {
                        const start = format(new Date(c.scheduled_at), "h:mm a");
                        const end = format(new Date(new Date(c.scheduled_at).getTime() + c.scheduled_duration * 1000), "h:mm a");
                        return (
                          <span key={c.id}>
                            {start}&ndash;{end} for &ldquo;{c.title}&rdquo;{i < conflictMeetings.length - 1 ? "; " : ""}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                )}
              </div>
              {meeting.vibe && (
                <div>
                  <p className="text-muted-foreground">Vibe</p>
                  <p className="font-medium">{meeting.vibe}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Agenda Items</p>
                <p className="font-medium">{meeting.agenda_items?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Participants</p>
                <p className="font-medium">{meeting.participants?.length ?? 0}</p>
              </div>
              {(meeting.status === "completed" || meeting.status === "logged") && meeting.actual_duration != null && (
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium flex items-center gap-2">
                    {formatDuration(meeting.actual_duration)}
                    {meeting.actual_duration > meeting.scheduled_duration ? (
                      <Badge variant="destructive" className="text-[10px]">
                        +{formatDuration(meeting.actual_duration - meeting.scheduled_duration)} over
                      </Badge>
                    ) : meeting.actual_duration < meeting.scheduled_duration ? (
                      <Badge variant="secondary" className="text-[10px]">
                        -{formatDuration(meeting.scheduled_duration - meeting.actual_duration)} under
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px]">Perfect</Badge>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {meeting.logged_at && (
            <Link href={`/meetings/${id}/report`} className={buttonVariants({ variant: "default", className: "w-full" })}>
              <FileText className="mr-2 h-4 w-4" />
              View Report
            </Link>
          )}

          <Button
            className="w-full"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print / Export
          </Button>

          {/* Sidebar Actions */}
          {meeting.status === "active" && canEdit && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                updateMeeting.mutate(
                  { id, patch: { status: "completed" } },
                  { onSuccess: () => toast.success("Meeting ended"), onError: async (e) => toast.error(await getErrorMsg(e)) }
                )
              }
              disabled={updateMeeting.isPending}
            >
              {updateMeeting.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />}
              End Meeting
            </Button>
          )}

          {(meeting.status === "completed" || meeting.status === "logged") && canEdit && (
            <Button
              className="w-full"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />}
              Save Outcome
            </Button>
          )}

          {SUPER_ADMIN_ROLES.includes(currentUser?.role as UserRole) && (
            <>
              <Button
                className="w-full"
                variant="destructive"
                onClick={() => setDropOpen(true)}
                disabled={deleteMeeting.isPending}
              >
                {deleteMeeting.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Drop meeting
              </Button>
              <Dialog open={dropOpen} onOpenChange={setDropOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Drop meeting</DialogTitle>
                    <DialogDescription>
                      This will permanently delete this meeting and all its data. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setDropOpen(false)}>Cancel</Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDropOpen(false);
                        deleteMeeting.mutate(id, {
                          onSuccess: () => { toast.success("Meeting dropped"); router.push("/meetings"); },
                          onError: async (e) => toast.error(await getErrorMsg(e)),
                        });
                      }}
                    >
                      Drop permanently
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              {inviteEmail} is not registered. Enter a name to invite them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Full name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                try {
                  const user = await inviteMutation.mutateAsync({ email: inviteEmail, name: inviteName });
                  updateActionItem(inviteIndex, "assignee_email", user.email);
                  setInviteOpen(false);
                  toast.success(`${inviteName} invited and assigned`);
                } catch (e) {
                  toast.error(await getErrorMsg(e));
                }
              }}
              disabled={inviteMutation.isPending || !inviteName.trim()}
            >
              {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Invite &amp; assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHostPicker} onOpenChange={setShowHostPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer host</DialogTitle>
            <DialogDescription>Select a new host for this meeting</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              value={hostSearch}
              onChange={(e) => setHostSearch(e.target.value)}
              placeholder="Search team members..."
              autoFocus
            />
            <HostSearchResults
              search={hostSearch}
              currentId={meeting.facilitator_id ?? user?.id ?? ""}
              onSelect={(userId) => {
                updateMeeting.mutate({ id, patch: { facilitator_id: userId } }, {
                  onSuccess: () => {
                    setShowHostPicker(false);
                    setHostSearch("");
                    toast.success("Host transferred");
                  },
                  onError: async (e) => toast.error(await getErrorMsg(e)),
                });
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to join</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-6">
            <QrCodeView url={appUrl(`/live/${meeting.share_token}`)} />
          </div>
          <div className="text-center text-sm text-muted-foreground break-all px-2 font-medium">
            {appUrl(`/live/${meeting.share_token}`)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HostSearchResults({ search, currentId, onSelect }: { search: string; currentId: string; onSelect: (id: string) => void }) {
  const { data, isFetching } = useQuery({
    queryKey: ["users", "search", search],
    queryFn: () => usersApi.list({ search, perPage: 10 }),
    enabled: search.length >= 1,
  });

  if (isFetching) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!search) return <p className="text-sm text-muted-foreground text-center py-4">Type to search</p>;

  const filtered = (data?.data ?? []).filter((u) => u.id !== currentId);

  if (filtered.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No results</p>;

  return (
    <div className="space-y-0.5 max-h-60 overflow-y-auto">
      {filtered.map((u) => (
        <button
          key={u.id}
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
          onClick={() => onSelect(u.id)}
        >
          <span className="font-medium">{u.name ?? u.email}</span>
          <span className="text-xs text-muted-foreground ml-auto">{u.email}</span>
        </button>
      ))}
    </div>
  );
}

function QrCodeView({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: 280, margin: 1, color: { dark: "#4a7c59", light: "#ffffff" },
    }).then(setDataUrl);
  }, [url]);

  if (!dataUrl) return <div className="h-[280px] w-[280px] animate-pulse rounded-xl bg-muted" />;
  return <img src={dataUrl} alt="QR Code" className="rounded-xl" width={280} height={280} />;
}
