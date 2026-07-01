"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Meeting } from "@/lib/types";

interface TvMeeting {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  department: string;
  meeting_type: string;
  room: { name: string } | null;
  facilitator: { name: string } | null;
  agenda_items: { title: string; duration: number }[];
}

export default function TvPage() {
  const { session } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [meetings, setMeetings] = useState<TvMeeting[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;

    async function fetchData() {
      const headers = { Authorization: `Bearer ${token}` };

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
      let all = activeRes.ok ? (await activeRes.json()).data ?? [] : [];

      if (all.length < 2) {
        const plannedParams = new URLSearchParams({
          status: "planned", per_page: "10", page: "1",
        });
        const plannedRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meetings?${plannedParams}`,
          { headers },
        );
        if (plannedRes.ok) {
          const planned = (await plannedRes.json()).data ?? [];
          planned.sort(
            (a: Meeting, b: Meeting) =>
              new Date(a.scheduled_at ?? 0).getTime() -
              new Date(b.scheduled_at ?? 0).getTime(),
          );
          all = [...all, ...planned].slice(0, 2);
        }
      }

      setMeetings(all as TvMeeting[]);
      setNow(new Date());
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [session?.access_token]);

  function formatTime(iso: string | null) {
    if (!iso) return "--";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  function isActive(m: TvMeeting) {
    return m.status === "active";
  }

  function totalDuration(m: TvMeeting) {
    return m.agenda_items?.reduce((sum, a) => sum + (a.duration || 0), 0) ?? 0;
  }

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

      {/* Meetings */}
      <div className="mt-8 flex flex-1 gap-8">
        {meetings.length === 0 && (
          <div className="flex w-full items-center justify-center">
            <p className="text-2xl text-white/40">No upcoming meetings</p>
          </div>
        )}

        {meetings.map((m, i) => (
          <Card
            key={m.id}
            className={`flex-1 border-0 bg-white/5 backdrop-blur-sm ${
              isActive(m) ? "ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-500/10" : ""
            }`}
          >
            <CardHeader className={`space-y-3 pb-4 ${isActive(m) ? "" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    {isActive(m) && (
                      <span className="flex h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <Badge variant={isActive(m) ? "default" : "secondary"} className="px-3 py-1 text-sm">
                      {isActive(m) ? "LIVE" : formatDate(m.scheduled_at)}
                    </Badge>
                    {m.room && (
                      <Badge variant="outline" className="border-white/20 text-white/70 text-sm">
                        {m.room.name}
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
                    {m.title}
                  </h2>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-lg text-white/70">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formatTime(m.scheduled_at)}</span>
                  <span className="text-white/40">&middot;</span>
                  <span>{totalDuration(m)} min</span>
                </div>
                <span className="text-white/30">&middot;</span>
                <Badge variant="outline" className="border-white/20 text-white/70 text-sm">
                  {m.department}
                </Badge>
                <Badge variant="outline" className="border-white/20 text-white/70 text-sm">
                  {m.meeting_type}
                </Badge>
                {m.facilitator && (
                  <>
                    <span className="text-white/30">&middot;</span>
                    <span>{m.facilitator.name}</span>
                  </>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {m.agenda_items && m.agenda_items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium uppercase tracking-wider text-white/40">Agenda</p>
                  <div className="space-y-1.5">
                    {m.agenda_items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-2.5"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white/60">
                          {idx + 1}
                        </span>
                        <span className="flex-1 text-lg">{item.title}</span>
                        {item.duration > 0 && (
                          <span className="text-sm text-white/40">{item.duration} min</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-white/30">
        Auto-updates every 30s
      </div>
    </div>
  );
}
