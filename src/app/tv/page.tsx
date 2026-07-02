"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { computeElapsed } from "@/lib/hooks/use-timer";
import { formatDuration, appUrl } from "@/lib/utils";
import { timerApi } from "@/lib/api/timer";
import { toDataURL as qrToDataURL } from "qrcode";
import { Timer, ArrowLeft, ExternalLink, Radio } from "lucide-react";

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
      qrToDataURL(appUrl(`/live/${meetings[0].share_token}`), { width: 240, margin: 1 })
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
        {/* Header */}
        <div className="flex items-center justify-between px-safe-area py-stack-md">
          <Button variant="ghost" size="sm" className="gap-2 text-on-surface-variant hover:text-primary" onClick={() => setFullscreenId(null)}>
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs uppercase tracking-widest font-semibold">Dashboard</span>
          </Button>
          <Button variant="link" size="sm" className="gap-1 text-on-surface-variant hover:text-primary no-underline" onClick={() => router.push(`/meetings/${fullscreenId}`)}>
            Open details
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col items-center justify-center px-safe-area -mt-12">
          {/* Live badge */}
          {m?.status === "active" && (
            <div className="mb-stack-md">
              <div className="relative flex items-center bg-primary-container text-on-primary-container px-5 py-1.5 rounded-full text-xs uppercase tracking-widest font-semibold">
                <span className="w-2 h-2 bg-on-primary-container rounded-full mr-3 animate-pulse" />
                LIVE
              </div>
            </div>
          )}

          {/* Title */}
          <h1 className="font-headline-xl text-headline-xl text-on-background text-center max-w-5xl mb-stack-sm tracking-tight">
            {m?.title}
          </h1>

          {/* Timer */}
          <div className="flex flex-col items-center">
            <div className="font-mono text-8xl md:text-9xl text-primary tracking-tighter select-none py-stack-sm">
              {formatDuration(el.total)}
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Timer className="h-4 w-4 text-primary" />
              <span>
                Remaining <span className="text-on-background font-bold">{formatDuration(Math.max((m?.scheduled_duration ?? 0) * 60 - el.total, 0))}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Footer room band */}
        {m?.room && (
          <footer className={`w-full px-safe-area h-20 flex items-center justify-between ${isRunning ? "border-t-4 border-primary bg-surface-container-low" : "bg-surface-container-low border-t border-outline-variant"}`}>
            <div className="flex items-center gap-stack-md">
              <div className={`relative flex items-center justify-center w-8 h-8`}>
                <div className={`w-4 h-4 rounded-full ${isRunning ? "bg-primary shadow-[0_0_15px_rgba(142,207,158,0.5)]" : "bg-outline"} z-10`} />
              </div>
              <div>
                <div className="text-headline-lg text-headline-lg text-on-surface leading-none">
                  {m.room.name}
                </div>
                <div className="text-xs uppercase tracking-widest text-on-surface-variant mt-1">
                  {isRunning ? "Running" : "Not running"}
                </div>
              </div>
            </div>
          </footer>
        )}
      </div>
    );
  }

  // Normal two-card view
  return (
    <div className="flex h-screen flex-col p-6 md:p-10">
      {/* Header */}
      <header className="flex justify-between items-end mb-stack-lg border-none">
        <div className="flex flex-col">
          <h1 className="font-headline-xl text-headline-xl text-primary tracking-tighter">{teamName || "Meetingz"}</h1>
          <p className="text-xs text-on-surface-variant uppercase tracking-widest mt-2">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-5xl text-on-surface leading-none">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-12 gap-gutter flex-1">
        {/* No meetings */}
        {meetings.length === 0 && (
          <div className="col-span-12 flex flex-col items-center justify-center">
            <p className="text-2xl text-on-surface-variant">No meetings planned for today</p>
            <p className="text-on-surface-variant/60 mt-2">Plan a meeting to get started</p>
          </div>
        )}

        {/* Meeting card */}
        {meetings[0] && (
          <MeetingCard
            meeting={meetings[0]}
            isActive={meetings[0].status === "active"}
            elapsed={elapsedMap[meetings[0].id]}
            timerRunning={timerData[meetings[0].id]?.is_running}
            onExpand={() => setFullscreenId(meetings[0].id)}
          />
        )}

        {/* Second card: meeting or QR fallback */}
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
          <div className="col-span-6" />
        ) : null}
      </div>

      {/* Footer */}
      <footer className="mt-auto py-stack-sm flex justify-between items-center border-t border-outline-variant">
        <span className="text-xs text-on-surface-variant">Auto-updates every 30s</span>
      </footer>
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
    <section
      className={`col-span-6 bg-surface-container overflow-hidden flex flex-col rounded-xl shadow-2xl cursor-pointer transition-all duration-200 hover:shadow-md ${
        active && timerRunning ? "border-l-[12px] border-primary" : "border-l-[12px] border-outline-variant"
      }`}
      onClick={onExpand}
    >
      <div className="p-card-padding flex-1 flex flex-col">
        {/* Status badge + elapsed */}
        <div className="flex items-center justify-between w-full mb-stack-lg">
          {active ? (
            <div className="relative flex items-center">
              <div className="bg-primary text-primary-foreground px-5 py-2 rounded-full flex items-center gap-2 text-sm font-semibold">
                <Radio className="h-4 w-4 fill-current" />
                LIVE
              </div>
            </div>
          ) : (
            <Badge variant="secondary" className="text-xs uppercase tracking-widest">
              Planned
            </Badge>
          )}
          {hasTimer && (
            <div className="flex flex-col items-end">
              <span className="text-xs text-on-surface-variant uppercase tracking-widest">Elapsed</span>
              <span className="font-mono text-sm text-primary">{formatDuration(elapsedTotal)}</span>
            </div>
          )}
        </div>

        {/* Title + timer */}
        <div className="flex flex-col items-center text-center mb-stack-lg">
          <h2 className="text-headline-md font-bold text-on-surface mb-4 max-w-2xl leading-tight">
            {meeting.title}
          </h2>
          {hasTimer && (
            <div className="bg-surface-container-low px-6 py-3 rounded-xl border border-outline-variant/30 shadow-lg">
              <span className="font-mono text-6xl md:text-7xl text-primary tracking-tighter">
                {formatDuration(elapsedTotal)}
              </span>
            </div>
          )}
          {hasTimer && (
            <p className="mt-3 text-sm text-on-surface-variant">
              {overBudget
                ? `Over budget by ${formatDuration(elapsedTotal - scheduledDurationSec)}`
                : `${formatDuration(scheduledDurationSec - elapsedTotal)} remaining`}
            </p>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center justify-center gap-3 text-sm text-on-surface-variant mb-stack-lg">
          <span>{formatTime(meeting.scheduled_at)}</span>
          <span className="w-1 h-1 rounded-full bg-outline-variant" />
          <span>{meetingDuration(meeting)} min</span>
          <span className="w-1 h-1 rounded-full bg-outline-variant" />
          <span>{meeting.department}</span>
          {meeting.meeting_type && <><span className="w-1 h-1 rounded-full bg-outline-variant" /><span>{meeting.meeting_type}</span></>}
          {meeting.facilitator && <><span className="w-1 h-1 rounded-full bg-outline-variant" /><span>{meeting.facilitator.name}</span></>}
        </div>

        <div className="flex-1" />

        {/* Agenda items */}
        {meeting.agenda_items && meeting.agenda_items.length > 0 && (
          <div className="w-full max-w-md mx-auto bg-surface-container-high/50 p-5 rounded-xl border border-outline-variant/20">
            <h3 className="text-xs text-primary border-b border-outline-variant pb-3 mb-3 uppercase tracking-widest font-semibold">Agenda</h3>
            <ul className="space-y-3">
              {meeting.agenda_items.slice(0, 3).map((item, idx) => (
                <li key={idx} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${idx === 0 ? "bg-primary/20" : "bg-surface-variant"}`}>
                    <span className={`text-xs ${idx === 0 ? "text-primary" : "text-on-surface-variant"}`}>
                      {idx + 1}
                    </span>
                  </div>
                  <span className="text-sm text-on-surface">{item.title}</span>
                  {item.duration > 0 && (
                    <span className="text-xs text-on-surface-variant ml-auto">{item.duration} min</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      {meeting.room && (
        <div className={`px-card-padding py-4 flex items-center justify-between ${active && timerRunning ? "bg-surface-container-high border-t border-outline-variant" : "bg-surface-container-high/50 border-t border-outline-variant"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${timerRunning ? "bg-primary shadow-[0_0_8px_rgba(142,207,158,0.6)]" : "bg-outline"}`} />
            <span className={`text-sm font-semibold ${timerRunning ? "text-primary" : "text-on-surface-variant"}`}>
              {meeting.room.name}
              {timerRunning && " \u2022 Running"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function QrFallbackCard({ meeting, qrDataUrl }: { meeting: TvMeeting; qrDataUrl: string }) {
  return (
    <section className="col-span-6 bg-surface-container-low border border-outline-variant flex flex-col rounded-xl">
      <div className="p-card-padding flex flex-col h-full items-center justify-center text-center">
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-stack-sm">Scan to join</h2>
        <p className="text-on-surface-variant mb-stack-lg max-w-sm">Access meeting notes, participant list, and screen sharing directly from your device.</p>
        <div className="bg-white p-5 rounded-xl shadow-lg mb-stack-lg border border-outline-variant/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR code"
            className="w-48 h-48"
          />
          <div className="mt-3 text-center text-xs text-slate-800 border-t border-slate-200 pt-3 uppercase tracking-widest font-semibold">
            {meeting.title}
          </div>
        </div>
      </div>
    </section>
  );
}
