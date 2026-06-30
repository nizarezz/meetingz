"use client";

import { use } from "react";
import Link from "next/link";
import { useMeeting } from "@/lib/hooks/use-meetings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckSquare, MessageSquare, FileText } from "lucide-react";
import { format } from "date-fns";


export default function MeetingReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: meeting, isLoading } = useMeeting(id);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
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

  if (!meeting.report_snapshot) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <p className="text-muted-foreground">This meeting has not been logged yet</p>
      </div>
    );
  }

  const snap = meeting.report_snapshot;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href={`/meetings/${id}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl text-foreground">{meeting.title}</h1>
            <Badge variant="outline">Report</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {meeting.department} &middot; {meeting.meeting_type}
            {meeting.scheduled_at && ` &middot; ${format(new Date(meeting.scheduled_at), "MMM d, yyyy h:mm a")}`}
          </p>
          {snap.logged_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Logged {format(new Date(snap.logged_at), "MMM d, yyyy h:mm a")}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Primary Outcomes */}
          {snap.outcomes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Outcomes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {snap.outcomes.map((o) => (
                  <div key={o.id} className="space-y-2">
                    <Badge variant="secondary">{o.primary_outcome}</Badge>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(o.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Outcome Notes */}
          {snap.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snap.notes.map((n, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg bg-accent/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {n.created_by_user?.name && <span>{n.created_by_user.name}</span>}
                        <span>{format(new Date(n.created_at), "MMM d, h:mm a")}</span>
                        {n.source === "comment" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">From comment</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Action Items */}
          {snap.action_items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" /> Action Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snap.action_items.map((ai) => (
                  <div key={ai.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{ai.text}</p>
                        <StatusBadge status={ai.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {ai.assignee_email && <span>{ai.assignee_email}</span>}
                        {ai.due_date && <span>Due {format(new Date(ai.due_date), "MMM d, yyyy")}</span>}
                        {ai.priority && ai.priority !== "medium" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ai.priority}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          {snap.comment_thread.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" /> Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snap.comment_thread.map((c) => (
                  <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-accent/30">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {(c.users?.name ?? "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{c.users?.name ?? "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{c.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pulled Comments */}
          {snap.pulled_comments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" /> Pulled into Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snap.pulled_comments.map((c) => (
                  <div key={c.id} className="flex gap-3 p-3 rounded-lg border-l-4 border-l-emerald-500 bg-accent/20">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {(c.users?.name ?? "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.users?.name ?? "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, h:mm a")}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pulled</Badge>
                      </div>
                      <p className="mt-1 text-sm">{c.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {snap.outcomes.length === 0 && snap.notes.length === 0 &&
           snap.action_items.length === 0 && snap.comment_thread.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-3 opacity-40" />
                <p>No report data available for this meeting</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Department</p>
                <p className="font-medium">{meeting.department}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium">{meeting.meeting_type}</p>
              </div>
              {meeting.scheduled_at && (
                <div>
                  <p className="text-muted-foreground">Scheduled</p>
                  <p className="font-medium">{format(new Date(meeting.scheduled_at), "MMM d, yyyy h:mm a")}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium flex items-center gap-2">
                  {formatDuration(meeting.actual_duration ?? meeting.scheduled_duration)}
                  {meeting.actual_duration != null && meeting.actual_duration > meeting.scheduled_duration ? (
                    <Badge variant="destructive" className="text-[10px]">
                      +{formatDuration(meeting.actual_duration - meeting.scheduled_duration)} over
                    </Badge>
                  ) : meeting.actual_duration != null && meeting.actual_duration < meeting.scheduled_duration ? (
                    <Badge variant="secondary" className="text-[10px]">
                      -{formatDuration(meeting.scheduled_duration - meeting.actual_duration)} under
                    </Badge>
                  ) : meeting.actual_duration != null ? (
                    <Badge variant="default" className="text-[10px]">Perfect</Badge>
                  ) : null}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Snapshot</p>
                <ul className="space-y-1 mt-1">
                  <li className="text-xs text-muted-foreground flex justify-between">
                    <span>Outcomes</span><span className="font-medium">{snap.outcomes.length}</span>
                  </li>
                  <li className="text-xs text-muted-foreground flex justify-between">
                    <span>Notes</span><span className="font-medium">{snap.notes.length}</span>
                  </li>
                  <li className="text-xs text-muted-foreground flex justify-between">
                    <span>Action items</span><span className="font-medium">{snap.action_items.length}</span>
                  </li>
                  <li className="text-xs text-muted-foreground flex justify-between">
                    <span>Comments</span><span className="font-medium">{snap.comment_thread.length}</span>
                  </li>
                </ul>
              </div>
              {snap.logged_at && (
                <div>
                  <p className="text-muted-foreground">Logged</p>
                  <p className="font-medium text-xs">{format(new Date(snap.logged_at), "MMM d, yyyy h:mm a")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    done: "default",
    blocked: "destructive",
    overdue: "destructive",
  };
  return <Badge variant={map[status] ?? "outline"} className="text-[10px] px-1.5 py-0">{status}</Badge>;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
