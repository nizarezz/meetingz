"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicMeetingsApi } from "@/lib/api";
import { useElapsedTime } from "@/lib/hooks/use-timer";
import type { LiveMeeting } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import { Timer, Mic, ListChecks, Clock, CheckCircle } from "lucide-react";
import { format } from "date-fns";

function UpcomingView({ data }: { data: LiveMeeting }) {
  return (
    <div className="min-h-screen bg-background p-6 max-w-lg mx-auto flex items-center justify-center">
      <Card className="w-full text-center">
        <CardHeader>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 mb-2">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{data.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="secondary">Upcoming</Badge>
          {data.scheduled_at && (
            <p className="text-muted-foreground">
              This meeting will start at{" "}
              <span className="font-medium text-foreground">
                {format(new Date(data.scheduled_at), "MMM d, yyyy h:mm a")}
              </span>
            </p>
          )}
          {data.department && (
            <p className="text-sm text-muted-foreground">
              {data.department} &middot; {data.meeting_type}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EndedView({ data }: { data: LiveMeeting }) {
  return (
    <div className="min-h-screen bg-background p-6 max-w-lg mx-auto flex items-center justify-center">
      <Card className="w-full text-center">
        <CardHeader>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 mb-2">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{data.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">Thank you for participating!</p>
          {data.department && (
            <p className="text-xs text-muted-foreground/60">{data.department} &middot; {data.meeting_type}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LiveView({ data }: { data: LiveMeeting }) {
  const elapsed = useElapsedTime(data);

  const currentItem = data.agenda_items?.[data.active_item_index ?? 0];

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{data.title}</h1>
        <Badge variant={data.state === "active" ? "default" : "secondary"} className="mt-2">
          {data.state === "active" ? "Live" : "Starting Soon"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" /> Timer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-mono font-bold text-center tabular-nums">
            {formatDuration(elapsed.total)}
          </div>
          {currentItem && (
            <p className="text-sm text-muted-foreground text-center mt-2">
              Current item: {formatDuration(elapsed.item)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" /> Current Item
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentItem ? (
            <div>
              <p className="text-lg font-medium">{currentItem.title}</p>
              {currentItem.presenter && (
                <p className="text-sm text-muted-foreground mt-1">Presenter: {currentItem.presenter}</p>
              )}
              <p className="text-sm text-muted-foreground">Duration: {formatDuration(currentItem.duration)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No agenda items</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Agenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.agenda_items?.map((item: { title: string; duration: number; presenter?: string }, i: number) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  i === data.active_item_index ? "bg-primary/10 border border-primary/30" : "bg-accent/30"
                }`}
              >
                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  i === data.active_item_index
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${i === data.active_item_index ? "font-medium" : ""}`}>{item.title}</p>
                  {item.presenter && <p className="text-xs text-muted-foreground">{item.presenter}</p>}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(item.duration)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LivePage({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = use(params);

  const { data, error } = useQuery({
    queryKey: ["live-meeting", share_token],
    queryFn: () => publicMeetingsApi.getByShareToken(share_token),
    refetchInterval: 2000,
    retry: 1,
  });

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto flex items-center justify-center">
        <Card className="w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-medium">Meeting not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              This link is invalid or the meeting has been deleted.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading meeting...</span>
        </div>
      </div>
    );
  }

  if (data.state === "upcoming") return <UpcomingView data={data} />;
  if (data.state === "ended") return <EndedView data={data} />;
  return <LiveView data={data} />;
}
