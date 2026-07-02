"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { computeElapsed } from "@/lib/hooks/use-timer";
import { formatDuration, appUrl } from "@/lib/utils";
import { timerApi } from "@/lib/api/timer";
import { toDataURL as qrToDataURL } from "qrcode";

interface TvMeeting {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  scheduled_duration: number;
  department: string;
  meeting_type: string;
  room: { name: string } | null;
  facilitator: { name: string } | null;
  agenda_items: { title: string; duration: number }[];
  share_token: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string | null) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function meetingDuration(m: TvMeeting) {
  return m.agenda_items?.reduce((sum, a) => sum + (a.duration || 0), 0) ?? 0;
}

export default function TvPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [meetings, setMeetings] = useState<TvMeeting[]>([]);
  const [now, setNow] = useState(new Date());
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [timerData, setTimerData] = useState<Record<string, { is_running: boolean; timer_started_at: string | null; timer_item_started_at: string | null; timer_base_total: number; timer_base_item: number }>>({});
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const timerDataRef = useRef(timerData);
  useEffect(() => { timerDataRef.current = timerData; }, [timerData]);

  const [elapsedMap, setElapsedMap] = useState<Record<string, { total: number; item: number }>>({});

  const [fullscreenElapsed, setFullscreenElapsed] = useState({ total: 0, item: 0 });
  const fullscreenTimerDataRef = useRef<typeof timerData[string] | null>(null);

  // Clock tick
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Generate QR code when there's exactly 1 meeting
  useEffect(() => {
    if (meetings.length === 1 && meetings[0].share_token) {
      qrToDataURL(appUrl(`/live/${meetings[0].share_token}`), { width: 200, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl(null);
    }
  }, [meetings]);

  // Fetch meeting & timer data every 30s
  const fetchData = useCallback(async () => {
    if (!session?.access_token) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };

    const teamRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/teams`,
      { headers },
    );
    if (teamRes.ok) {
      const team = await teamRes.json();
      setTeamName(team.name ?? "Meetingz");
    }

    const params = new URLSearchParams({ status: "active", per_page: "10" });
    const activeRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meetings?${params}`,
      { headers },
    );
    let all: TvMeeting[] = activeRes.ok ? (await activeRes.json()).data ?? [] : [];

    if (all.length < 2) {
      const plannedParams = new URLSearchParams({ status: "planned", per_page: "10", page: "1" });
      const plannedRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meetings?${plannedParams}`,
        { headers },
      );
      if (plannedRes.ok) {
        const planned: TvMeeting[] = (await plannedRes.json()).data ?? [];
        planned.sort(
          (a, b) =>
            new Date(a.scheduled_at ?? 0).getTime() -
            new Date(b.scheduled_at ?? 0).getTime(),
        );
        all = [...all, ...planned].slice(0, 2);
      }
    }

    setMeetings(all);

    const timerMap: typeof timerData = {};
    for (const m of all) {
      if (m.status === "active") {
        try {
          const state = await timerApi.get(m.id);
          timerMap[m.id] = {
            is_running: state.is_running,
            timer_started_at: state.timer_started_at,
            timer_item_started_at: state.timer_item_started_at,
            timer_base_total: state.timer_base_total,
            timer_base_item: state.timer_base_item,
          };
        } catch {
          // ignore
        }
      }
    }
    setTimerData(timerMap);
  }, [session]);

  useEffect(() => {
    if (!session?.access_token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // Tick elapsed for all active meetings every 1s
  useEffect(() => {
    const el: Record<string, { total: number; item: number }> = {};
    for (const m of meetings) {
      if (m.status === "active" && timerData[m.id]) {
        el[m.id] = computeElapsed(timerData[m.id]);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsedMap(el);

    const interval = setInterval(() => {
      const updated: Record<string, { total: number; item: number }> = {};
      const current = timerDataRef.current;
      for (const mId of Object.keys(current)) {
        updated[mId] = computeElapsed(current[mId]);
      }
      setElapsedMap(updated);
    }, 1000);
    return () => clearInterval(interval);
  }, [meetings, timerData]);

  // Tick fullscreen timer separately
  useEffect(() => {
    if (!fullscreenId) return;
    const td = timerData[fullscreenId];
    if (!td?.is_running) return;

    fullscreenTimerDataRef.current = td;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullscreenElapsed(computeElapsed(td));

    const interval = setInterval(() => {
      const current = fullscreenTimerDataRef.current;
      if (current) setFullscreenElapsed(computeElapsed(current));
    }, 1000);
    return () => clearInterval(interval);
  }, [fullscreenId, timerData]);

  // Fullscreen timer view
  if (fullscreenId) {
    const m = meetings.find((x) => x.id === fullscreenId);
    const td = timerData[fullscreenId];
    const isRunning = td?.is_running;
    const el = fullscreenElapsed;

    return (
      <div className="flex min-h-screen flex-col">
        {/* Header with back arrow */}
        <div className="flex items-center justify-between px-8 pt-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/60 hover:text-white gap-1"
            onClick={() => setFullscreenId(null)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/40 hover:text-white"
            onClick={() => router.push(`/meetings/${fullscreenId}`)}
          >
            Open details &rarr;
          </Button>
        </div>

        {/* Timer section - matching the normal timer card style */}
        <div className="flex flex-1 flex-col items-center justify-center px-8 -mt-12">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">{m?.title}</h1>
          <Badge
            variant={m?.status === "active" ? "default" : "secondary"}
            className={`mb-6 px-3 py-1 ${m?.status === "active" ? "bg-amber-500" : ""}`}
          >
            {m?.status === "active" ? "LIVE" : formatDate(m?.scheduled_at ?? null)}
          </Badge>

          {/* Timer display - matches normal timer card: text-6xl, no color, muted subtitle */}
          <div className="text-center">
            <p className="text-6xl font-mono font-bold tabular-nums tracking-tight">
              {formatDuration(el.total)}
            </p>
            <p className="mt-2 text-muted-foreground">
              {el.total > (m?.scheduled_duration ?? 0) * 60
                ? `Over budget by ${formatDuration(el.total - (m?.scheduled_duration ?? 0) * 60)}`
                : `${formatDuration((m?.scheduled_duration ?? 0) * 60 - el.total)} remaining`}
            </p>
          </div>
        </div>

        {/* Room band */}
        {m?.room && (
          <div className={`flex items-center justify-center gap-2 px-8 py-4 text-base ${
            isRunning ? "bg-amber-500/10 text-amber-500 font-semibold" : "text-muted-foreground"
          }`}>
            <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-amber-500 animate-pulse" : "bg-muted-foreground"}`} />
            {m.room.name}
            {isRunning && <span className="text-sm font-normal text-amber-500/70">\u2022 Running</span>}
          </div>
        )}
      </div>
    );
  }

  // Normal two-card view
  return (
    <div className="flex h-screen flex-col p-8 md:p-12">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-white/10 pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-2xl font-bold">
          {teamName.charAt(0) || "M"}
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{teamName || "Meetingz"}</h1>
          <p className="text-lg text-white/60">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-5xl font-light tabular-nums tracking-wider">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-8 flex flex-1 gap-8">
        {meetings.length === 0 && (
          <div className="flex w-full flex-col items-center justify-center gap-4">
            <p className="text-2xl text-white/40">No meetings planned for today</p>
            <p className="text-lg text-white/20">Plan a meeting to get started</p>
          </div>
        )}

        {meetings[0] && (
          <MeetingCard
            meeting={meetings[0]}
            isActive={meetings[0].status === "active"}
            elapsed={elapsedMap[meetings[0].id]}
            timerRunning={timerData[meetings[0].id]?.is_running}
            onExpand={() => setFullscreenId(meetings[0].id)}
          />
        )}

        {meetings.length >= 2 ? (
          <MeetingCard
            meeting={meetings[1]}
            isActive={meetings[1].status === "active"}
            elapsed={elapsedMap[meetings[1].id]}
            timerRunning={timerData[meetings[1].id]?.is_running}
            onExpand={() => setFullscreenId(meetings[1].id)}
          />
        ) : meetings.length === 1 && qrDataUrl ? (
          <QrFallbackCard meeting={meetings[0]} qrDataUrl={qrDataUrl} />
        ) : meetings.length === 1 ? (
          <div className="flex-1" />
        ) : null}
      </div>

      <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-white/30">
        Auto-updates every 30s
      </div>
    </div>
  );
}

function MeetingCard({
  meeting,
  isActive: active,
  elapsed,
  timerRunning,
  onExpand,
}: {
  meeting: TvMeeting;
  isActive: boolean;
  elapsed?: { total: number; item: number };
  timerRunning?: boolean;
  onExpand: () => void;
}) {
  const scheduledDurationSec = meeting.scheduled_duration * 60;
  const elapsedTotal = elapsed?.total ?? 0;
  const overBudget = elapsedTotal > scheduledDurationSec;
  const hasTimer = active && elapsed !== undefined;

  return (
    <div
      className={`group relative flex flex-1 cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md ${
        active && timerRunning ? "border-amber-500/40 shadow-amber-500/10" : ""
      }`}
      onClick={onExpand}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {active && (
            <span className={`flex h-2 w-2 rounded-full ${timerRunning ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/30"}`} />
          )}
          <CardTitle className="text-base font-medium">
            {active ? "LIVE" : formatDate(meeting.scheduled_at)}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <h2 className="text-xl font-bold leading-tight tracking-tight">
            {meeting.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span>{formatTime(meeting.scheduled_at)}</span>
            <span>&middot;</span>
            <span>{meetingDuration(meeting)} min</span>
            <span>&middot;</span>
            <span>{meeting.department}</span>
            {meeting.meeting_type && <><span>&middot;</span><span>{meeting.meeting_type}</span></>}
            {meeting.facilitator && <><span>&middot;</span><span>{meeting.facilitator.name}</span></>}
          </div>
        </div>

        {/* Timer section - matching the normal timer card exactly */}
        {hasTimer && (
          <div className="text-center">
            <p className="text-6xl font-mono font-bold tabular-nums tracking-tight">
              {formatDuration(elapsedTotal)}
            </p>
            <p className="mt-2 text-muted-foreground">
              {overBudget
                ? `Over budget by ${formatDuration(elapsedTotal - scheduledDurationSec)}`
                : `${formatDuration(scheduledDurationSec - elapsedTotal)} remaining`}
            </p>
          </div>
        )}

        {/* Room band */}
        {meeting.room && (
          <div className={`-mx-6 -mb-6 mt-2 flex items-center gap-2 px-6 py-3 text-sm ${
            timerRunning
              ? "bg-amber-500/10 text-amber-500 font-semibold"
              : "text-muted-foreground"
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              timerRunning ? "bg-amber-500 animate-pulse" : "bg-muted-foreground"
            }`} />
            {meeting.room.name}
            {timerRunning && <span className="text-xs font-normal text-amber-500/70">\u2022 Running</span>}
          </div>
        )}
      </CardContent>
    </div>
  );
}

function QrFallbackCard({ meeting, qrDataUrl }: { meeting: TvMeeting; qrDataUrl: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
      <p className="text-center text-lg text-white/40">Scan to join</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrDataUrl}
        alt="QR code"
        className="h-48 w-48 rounded-xl bg-white p-2"
      />
      <p className="text-center text-base text-white/30 max-w-xs truncate">
        {meeting.title}
      </p>
    </div>
  );
}
