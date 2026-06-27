"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useMeetings } from "@/lib/hooks/use-meetings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Timer, CheckSquare, TrendingUp, Users } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { MEETING_STATUS_BADGE } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: page, isLoading } = useMeetings();
  const allMeetings = page?.data ?? [];
  const name = user?.user_metadata?.name ?? user?.email ?? "User";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState("");

  function applyPreset(p: string) {
    setPreset(p);
    if (p === "all") { setDateFrom(""); setDateTo(""); return; }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if (p === "today") { setDateFrom(`${yyyy}-${mm}-${dd}`); setDateTo(`${yyyy}-${mm}-${dd}`); return; }
    if (p === "week") {
      const dow = today.getDay();
      const mon = new Date(today);
      mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      setDateFrom(f(mon)); setDateTo(f(sun)); return;
    }
    if (p === "month") {
      setDateFrom(`${yyyy}-${mm}-01`);
      const last = new Date(yyyy, today.getMonth() + 1, 0);
      setDateTo(`${yyyy}-${mm}-${String(last.getDate()).padStart(2, "0")}`);
    }
  }

  const clearFilter = () => { setDateFrom(""); setDateTo(""); setPreset(""); };

  const meetings = allMeetings.filter((m) => {
    const date = m.created_at || m.scheduled_at;
    if (!date) return !dateFrom && !dateTo;
    const d = new Date(date);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const localDate = `${y}-${mo}-${day}`;
    if (dateFrom && localDate < dateFrom) return false;
    if (dateTo && localDate > dateTo) return false;
    return true;
  });

  const activeMeetings = meetings.filter((m) => m.status === "active");
  const recentMeetings = meetings.filter((m) => m.status !== "planned").slice(0, 5);
  const plannedMeetings = meetings.filter((m) => m.status === "planned");

  const stats = [
    { label: "Active", value: activeMeetings.length, icon: Timer, color: "text-emerald-500" },
    { label: "Completed", value: meetings.filter((m) => m.status === "completed").length, icon: CheckSquare, color: "text-blue-500" },
    { label: "Outcomes Logged", value: meetings.filter((m) => m.status === "logged").length, icon: TrendingUp, color: "text-violet-500" },
    { label: "Participants", value: new Set(meetings.flatMap((m) => m.participants?.map((p) => p.user_id) ?? [])).size, icon: Users, color: "text-amber-500" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-6">
              <Skeleton className="h-4 w-16 mb-3" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
        <div>
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Welcome, {name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here is your meeting overview</p>
        </div>
        <Link href="/meetings/new" className={buttonVariants({})}>
          <Plus className="mr-2 h-4 w-4" /> New Meeting
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreset(""); }} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPreset(""); }} className="h-9 w-40" />
        </div>
        <div className="flex items-center gap-1">
          {["today","week","month","all"].map((p) => (
            <Button key={p} variant={preset === p ? "default" : "outline"} size="sm" onClick={() => applyPreset(p)} className="h-9 capitalize">
              {p === "all" ? "All" : `This ${p}`}
            </Button>
          ))}
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={clearFilter}>Clear</Button>
        )}
        <p className="text-xs text-muted-foreground pb-0.5">
          {meetings.length} of {allMeetings.length} meetings
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeMeetings.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl">Active Meetings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeMeetings.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`}>
                <Card className="cursor-pointer transition hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base">{m.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{m.department} · {m.meeting_type}</p>
                    <p>{m.agenda_items?.length ?? 0} agenda items</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 font-display text-xl">Upcoming</h2>
          {plannedMeetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No planned meetings</p>
          ) : (
            <div className="space-y-3">
              {plannedMeetings.map((m) => (
                <Link key={m.id} href={`/meetings/${m.id}`}>
                  <Card className="cursor-pointer transition hover:shadow-sm">
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.scheduled_at
                            ? format(new Date(m.scheduled_at), "MMM d, yyyy h:mm a")
                            : "No schedule"}
                        </p>
                      </div>
                      <Badge variant={MEETING_STATUS_BADGE[m.status] ?? "outline"}>
                        {m.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 font-display text-xl">Recent Activity</h2>
          {recentMeetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent meetings</p>
          ) : (
            <div className="space-y-3">
              {recentMeetings.map((m) => (
                <Link key={m.id} href={`/meetings/${m.id}`}>
                  <Card className="cursor-pointer transition hover:shadow-sm">
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.created_at
                            ? format(new Date(m.created_at), "MMM d, yyyy h:mm a")
                            : "Unknown"}
                        </p>
                      </div>
                      <Badge variant={MEETING_STATUS_BADGE[m.status] ?? "outline"}>
                        {m.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
