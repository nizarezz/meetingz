"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMeeting, useUpdateMeeting, useDeleteMeeting } from "@/lib/hooks/use-meetings";
import { useAuth } from "@/components/providers/auth-provider";
import { useUser } from "@/lib/hooks/use-users";
import { useTimer, useStartTimer, usePauseTimer, useResumeTimer, useNextItem, useResetTimer } from "@/lib/hooks/use-timer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { outcomesApi, commentsApi } from "@/lib/api";
import { useRealtimeInvalidation } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Play, Pause, SkipForward, RotateCcw, Timer as TimerIcon, CheckSquare, Plus, Trash2, Printer, Loader2, MessageSquare, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { PrimaryOutcome, ActionItem, Comment as CommentType } from "@/lib/types";
import { formatDuration, getErrorMsg } from "@/lib/utils";
import { MEETING_STATUS_BADGE, SUPER_ADMIN_ROLES } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import { ADMIN_ROLES } from "@/lib/types";
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
  const { user, role } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(role as UserRole);
  const { data: currentUser } = useUser(user?.id ?? "");
  const deleteMeeting = useDeleteMeeting();
  const router = useRouter();

  // Timer live counting
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayItem, setDisplayItem] = useState(0);
  const baseRef = useRef({ total: 0, item: 0 });
  const stampRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!timer) return;
    baseRef.current = { total: timer.elapsed_total, item: timer.elapsed_item };
    stampRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayTotal(timer.elapsed_total);
    setDisplayItem(timer.elapsed_item);
  }, [timer, timer?.is_running, timer?.elapsed_total, timer?.elapsed_item]);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!timer?.is_running) return;
    intervalRef.current = setInterval(() => {
      const delta = Math.floor((Date.now() - stampRef.current) / 1000);
      setDisplayTotal(baseRef.current.total + delta);
      setDisplayItem(baseRef.current.item + delta);
    }, 200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer?.is_running]);

  const totalToShow = timer?.is_running ? displayTotal : (timer?.elapsed_total ?? 0);
  const itemToShow = timer?.is_running ? displayItem : (timer?.elapsed_item ?? 0);

  // Outcome form
  const { data: existingOutcome } = useQuery({
    queryKey: ["outcomes", id],
    queryFn: () => outcomesApi.get(id),
    enabled: !!meeting,
  });

  const [primaryOutcome, setPrimaryOutcome] = useState<PrimaryOutcome>("Decision Made");
  const [actionItems, setActionItems] = useState<ActionItem[]>([{ task: "", assignee: "", due: "" }]);
  const [notes, setNotes] = useState("");
  useRealtimeInvalidation([
    { channel: "meeting-detail-meeting", table: "meetings", events: ["UPDATE"], filter: `id=eq.${id}`, queryKeys: [["meetings", id], ["timer", id], ["meetings"]] },
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



  useEffect(() => {
    if (existingOutcome) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrimaryOutcome((existingOutcome.primary_outcome as PrimaryOutcome) ?? "Decision Made");
      setActionItems(existingOutcome.action_items?.length ? existingOutcome.action_items : [{ task: "", assignee: "", due: "" }]);
      setNotes(existingOutcome.notes ?? "");
    }
  }, [existingOutcome]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        primary_outcome: primaryOutcome as PrimaryOutcome,
        action_items: actionItems.filter((a) => a.task.trim()),
        notes,
      };
      if (existingOutcome) return outcomesApi.update(id, body);
      return outcomesApi.create(id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outcomes", id] });
      qc.invalidateQueries({ queryKey: ["meetings", id] });
      toast.success("Outcome saved");
    },
    onError: async (e) => toast.error(await getErrorMsg(e)),
  });

  function addActionItem() {
    setActionItems((prev) => [...prev, { task: "", assignee: "", due: "" }]);
  }
  function removeActionItem(index: number) {
    setActionItems((prev) => prev.filter((_, i) => i !== index));
  }
  function updateActionItem(index: number, field: keyof ActionItem, value: string | boolean) {
    setActionItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
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
            {meeting.scheduled_at && ` &middot; ${format(new Date(meeting.scheduled_at), "MMM d, yyyy h:mm a")}`}
          </p>
        </div>
        {meeting.share_token && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const url = `${window.location.origin}/live/${meeting.share_token}`;
              navigator.clipboard.writeText(url);
              toast.success("Live link copied to clipboard");
            }}
          >
            <Share2 className="h-4 w-4" /> Share Live
          </Button>
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

                {isAdmin && (
                  <div className="flex justify-center gap-3">
                    {!timer.is_running ? (
                      <Button
                        size="lg"
                        className="h-14 w-14 rounded-full"
                        onClick={() => {
                          const fn = timer.paused_at ? resumeTimer.mutate : startTimer.mutate;
                          fn(id, { onError: async (e) => toast.error(await getErrorMsg(e)) });
                        }}
                        disabled={startTimer.isPending || resumeTimer.isPending}
                      >
                        {(startTimer.isPending || resumeTimer.isPending)
                          ? <Loader2 className="h-6 w-6 animate-spin" />
                          : <Play className="h-6 w-6 fill-current" />}
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 w-14 rounded-full"
                        onClick={() => pauseTimer.mutate(id, { onError: async (e) => toast.error(await getErrorMsg(e)) })}
                        disabled={pauseTimer.isPending}
                      >
                        {pauseTimer.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Pause className="h-6 w-6" />}
                      </Button>
                    )}

                    {timer.is_running && meeting.agenda_items && timer.active_item_index < meeting.agenda_items.length - 1 && (
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

                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 w-14 rounded-full"
                      onClick={() => resetTimer.mutate(id, { onError: async (e) => toast.error(await getErrorMsg(e)) })}
                      disabled={resetTimer.isPending}
                    >
                      {resetTimer.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <RotateCcw className="h-6 w-6" />}
                    </Button>
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
                  {isAdmin ? (
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
                  {isAdmin && (
                    <Button type="button" variant="outline" size="sm" onClick={addActionItem}>
                      <Plus className="mr-1 h-3 w-3" /> Add
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {actionItems.filter((a) => a.task.trim()).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No action items</p>
                  ) : (
                    actionItems.map((item, i) => (
                      <div key={i} className="space-y-2 p-3 border rounded-lg">
                        {isAdmin ? (
                          <>
                            <div className="flex items-start gap-2">
                              <Input
                                value={item.task}
                                onChange={(e) => updateActionItem(i, "task", e.target.value)}
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
                                <Input
                                  value={item.assignee ?? ""}
                                  onChange={(e) => updateActionItem(i, "assignee", e.target.value)}
                                  placeholder="Assignee email"
                                  type="email"
                                  className="text-sm"
                                />
                              </div>
                              <div className="w-40">
                                <Input
                                  type="date"
                                  value={item.due ?? ""}
                                  onChange={(e) => updateActionItem(i, "due", e.target.value)}
                                  className="text-sm"
                                />
                              </div>
                              <Button
                                type="button"
                                variant={item.done ? "default" : "outline"}
                                size="icon"
                                className="shrink-0"
                                onClick={() => updateActionItem(i, "done", !item.done)}
                              >
                                <CheckSquare className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-start justify-between">
                            <div>
                              <p className={`text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>
                                {item.task}
                              </p>
                              {(item.assignee || item.due) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {item.assignee && <span>{item.assignee}</span>}
                                  {item.assignee && item.due && <span> · </span>}
                                  {item.due && <span>Due {item.due}</span>}
                                </p>
                              )}
                            </div>
                            {item.done && <CheckSquare className="h-4 w-4 text-emerald-500 shrink-0" />}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {isAdmin ? (
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Additional notes or comments..."
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{notes || "No notes"}</p>
                  )}
                </CardContent>
              </Card>

              {isAdmin && (
                <Button
                  className="w-full"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Outcome
                </Button>
              )}
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
              {comments && comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((c: CommentType) => (
                    <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-accent/30">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(c.users?.name ?? "U")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{c.users?.name ?? "Unknown"}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.users?.role ?? "member"}</Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(c.created_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="mt-1 text-sm">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet</p>
              )}

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
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(meeting.scheduled_duration)}</p>
              </div>
              {meeting.scheduled_at && (
                <div>
                  <p className="text-muted-foreground">Scheduled</p>
                  <p className="font-medium">{format(new Date(meeting.scheduled_at), "MMM d, yyyy h:mm a")}</p>
                </div>
              )}
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
            </CardContent>
          </Card>

          <Button
            className="w-full"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print / Export
          </Button>

          {/* Sidebar Actions */}
          {meeting.status === "active" && isAdmin && (
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

          {(meeting.status === "completed" || meeting.status === "logged" || meeting.status === "active") && isAdmin && (
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
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => {
                if (confirm("Archive this meeting? It will be hidden from all users.")) {
                  deleteMeeting.mutate(id, {
                    onSuccess: () => { toast.success("Meeting archived"); router.push("/meetings"); },
                    onError: async (e) => toast.error(await getErrorMsg(e)),
                  });
                }
              }}
              disabled={deleteMeeting.isPending}
            >
              {deleteMeeting.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Archive Meeting
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
