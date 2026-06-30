"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useMeetings } from "@/lib/hooks/use-meetings";
import { meetingsApi } from "@/lib/api";
import { useRealtimeInvalidation } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, Search, Calendar, Clock, MoreVertical, Mic, CheckCircle, FileEdit, FileText, QrCode, Share2, ExternalLink, Download } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_ROLES } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import QRCode from "qrcode";
import { toast } from "sonner";

type Tab = "upcoming" | "live" | "past" | "drafts";

function googleCalUrl(m: { title: string; scheduled_at: string; scheduled_duration?: number }): string {
  const start = new Date(m.scheduled_at);
  const end = new Date(start.getTime() + (m.scheduled_duration ?? 3600) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtLocal = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title,
    dates: `${fmtLocal(start)}/${fmtLocal(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "past", label: "Past" },
  { key: "drafts", label: "Drafts" },
];

const ICON_MAP: Record<Tab, React.ElementType> = {
  upcoming: Calendar,
  live: Mic,
  past: CheckCircle,
  drafts: FileEdit,
};

const TAB_BG: Record<Tab, string> = {
  upcoming: "bg-primary-container text-on-primary-container",
  live: "bg-error-container text-on-error-container",
  past: "bg-surface-variant text-outline",
  drafts: "bg-surface-variant text-on-surface-variant",
};

export default function MeetingsPage() {
  const { role } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(role as UserRole);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useMeetings({ perPage: 100 });

  useRealtimeInvalidation([
    { channel: "meetings-list", table: "meetings", events: ["*"], queryKeys: [["meetings"]] },
  ]);

  const rawMeetings = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    return rawMeetings.filter((m) => {
      const now = new Date();
      let match = true;
      switch (tab) {
        case "live":
          match = m.status === "active";
          break;
        case "upcoming":
          match = m.status === "planned" && !!m.scheduled_at && new Date(m.scheduled_at) > now;
          break;
        case "past":
          match = m.status === "completed" || m.status === "logged";
          break;
        case "drafts":
          match = m.status === "planned" && !m.scheduled_at;
          break;
      }
      if (!match) return false;
      if (search) {
        return m.title.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [rawMeetings, tab, search]);

  const countByTab = useMemo(() => {
    const counts: Record<Tab, number> = { upcoming: 0, live: 0, past: 0, drafts: 0 };
    for (const m of rawMeetings) {
      const now = new Date();
      if (m.status === "active") counts.live++;
      else if (m.status === "planned" && !!m.scheduled_at && new Date(m.scheduled_at) > now) counts.upcoming++;
      else if (m.status === "completed" || m.status === "logged") counts.past++;
      else if (m.status === "planned" && !m.scheduled_at) counts.drafts++;
    }
    return counts;
  }, [rawMeetings]);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  async function exportPastMeetings() {
    const past = rawMeetings.filter((m) => m.status === "completed" || m.status === "logged");
    if (past.length === 0) return toast("No past meetings to export");

    const detailed = await Promise.all(past.map((m) => meetingsApi.get(m.id).catch(() => null)));
    const lines: string[] = [];
    lines.push("# Meeting Reports\n");
    lines.push(`> Generated on ${format(new Date(), "MMMM d, yyyy h:mm a")}\n`);
    lines.push(`> Total meetings: ${past.length}\n`);

    for (const m of detailed) {
      if (!m) continue;
      lines.push(`## ${m.title}\n`);
      lines.push(`- **Date:** ${m.scheduled_at ? format(new Date(m.scheduled_at), "MMMM d, yyyy") : "N/A"}`);
      lines.push(`- **Time:** ${m.scheduled_at ? format(new Date(m.scheduled_at), "h:mm a") : "N/A"}`);
      lines.push(`- **Duration:** ${m.scheduled_duration ? `${Math.round(m.scheduled_duration / 60)} min` : "N/A"}`);
      if (m.actual_duration != null) lines.push(`- **Actual Duration:** ${Math.round(m.actual_duration / 60)} min`);
      lines.push(`- **Status:** ${m.status}`);
      lines.push(`- **Department:** ${m.department ?? "N/A"}`);
      lines.push(`- **Type:** ${m.meeting_type ?? "N/A"}`);
      if (m.facilitator?.name) lines.push(`- **Facilitator:** ${m.facilitator.name}`);
      lines.push("");

      const snap = m.report_snapshot as Record<string, unknown> | null;
      if (snap) {
        const outcomes = snap.outcomes as Array<Record<string, unknown>> | undefined;
        if (outcomes?.length) {
          lines.push("### Outcomes\n");
          for (const o of outcomes) {
            lines.push(`- ${(o.primary_outcome as string) ?? "N/A"} ${o.created_at ? `(${format(new Date(o.created_at as string), "MMM d, h:mm a")})` : ""}`);
          }
          lines.push("");
        }

        const notes = snap.notes as Array<Record<string, unknown>> | undefined;
        if (notes?.length) {
          lines.push("### Notes\n");
          for (const n of notes) {
            const author = (n.created_by_user as Record<string, unknown> | undefined)?.name as string ?? "";
            lines.push(`- ${(n.text as string) ?? ""}${author ? ` — ${author}` : ""}`);
          }
          lines.push("");
        }

        const items = snap.action_items as Array<Record<string, unknown>> | undefined;
        if (items?.length) {
          lines.push("### Action Items\n");
          for (const item of items) {
            const status = (item.status as string) ?? "pending";
            const icon = status === "done" ? "✅" : status === "blocked" ? "🚫" : "⬜";
            lines.push(`- ${icon} ${(item.text as string) ?? ""}${item.due_date ? ` (due: ${format(new Date(item.due_date as string), "MMM d, yyyy")})` : ""}`);
          }
          lines.push("");
        }

        const comments = snap.comments as Array<Record<string, unknown>> | undefined;
        if (comments?.length) {
          lines.push("### Comments\n");
          for (const c of comments) {
            const name = (c.users as Record<string, unknown> | undefined)?.name as string ?? "Unknown";
            lines.push(`- **${name}:** ${(c.text as string) ?? ""}`);
          }
          lines.push("");
        }
      }

      if (m.agenda_items?.length) {
        lines.push("### Agenda\n");
        for (const item of m.agenda_items) {
          lines.push(`- ${item.title}${item.duration ? ` (${Math.round(item.duration / 60)} min)` : ""}${item.presenter ? ` — ${item.presenter}` : ""}`);
        }
        lines.push("");
      }

      lines.push("---\n");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meeting-reports-${format(new Date(), "yyyy-MM-dd")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${past.length} meeting reports`);
  }

  return (
    <div className="flex flex-col">
      {/* Page header */}
      <div className="shrink-0 pb-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-4xl font-bold tracking-tight">Workspace</h2>
            <p className="mt-1 text-muted-foreground text-lg">Manage your schedule and collaborative sessions.</p>
          </div>
          {isAdmin && (
            <Link href="/meetings/new">
              <Button className="hidden md:flex items-center gap-2 rounded-xl px-6 py-6 font-bold shadow-sm">
                <Plus className="h-4 w-4" />
                Plan Meeting
              </Button>
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-outline-variant/40">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = countByTab[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "pb-3 text-lg font-semibold transition-colors relative",
                  active
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {active && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary-container text-on-primary-container text-xs font-bold px-2 py-0.5">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="shrink-0 flex items-center gap-4 py-4 bg-surface-container-low/50 -mx-6 px-6 md:-mx-10 md:px-10">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border-none bg-surface pl-12 pr-4 py-3 shadow-sm placeholder:text-outline focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {tab === "past" && (
          <Button variant="outline" size="sm" className="rounded-xl border-outline-variant/20 shadow-sm gap-1.5" onClick={exportPastMeetings}>
            <Download className="h-4 w-4" />
            Reports
          </Button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {error ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-destructive">Failed to load meetings</p>
        </div>
      ) : isLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-xl p-6 flex items-center gap-6 shadow-sm border border-transparent">
                <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-3/5" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-10 w-20 rounded-lg" />
              </div>
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg font-medium text-muted-foreground">
              {search ? "No meetings match your search" : `No ${tab} meetings`}
            </p>
            {!search && tab !== "past" && isAdmin && (
              <Link href="/meetings/new" className="mt-4">
                <Button className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" /> Plan Meeting
                </Button>
              </Link>
            )}
          </div>
        ) : (
          filtered.map((m) => {
            const isLive = m.status === "active";
            const isDraft = tab === "drafts";
            const isPast = tab === "past";
            return (
              <div
                key={m.id}
                className={cn(
                  "bg-surface rounded-xl p-6 flex items-center justify-between transition-colors",
                  isLive
                    ? "shadow-sm border border-primary/20 hover:border-primary/40"
                    : isDraft
                      ? "border border-dashed border-outline-variant hover:border-primary/50 opacity-70 hover:opacity-100"
                      : "shadow-sm border border-transparent hover:border-outline-variant/50",
                )}
              >
                <Link href={`/meetings/${m.id}`} className="flex items-center gap-6 min-w-0 flex-1 cursor-pointer group">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    TAB_BG[tab],
                  )}>
                    {(() => {
                      const Icon = ICON_MAP[tab];
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className={cn(
                        "font-display text-xl font-semibold truncate",
                        isPast ? "text-outline line-through group-hover:text-foreground" : "text-foreground",
                        "group-hover:text-primary transition-colors",
                      )}>
                        {m.title}
                      </h3>
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider shrink-0",
                        isLive
                          ? "bg-error/10 text-error"
                          : isDraft
                            ? "bg-surface-variant text-muted-foreground"
                            : "bg-primary-container text-on-primary-fixed-variant",
                      )}>
                        {isLive ? "Live" : isDraft ? "Draft" : isPast ? "Finished" : "Scheduled"}
                      </span>
                    </div>
                    <div className="flex items-center text-muted-foreground text-sm gap-4 flex-wrap">
                      {m.scheduled_at ? (
                        <>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(m.scheduled_at), "MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(m.scheduled_at), "h:mm a")}
                            {m.scheduled_duration && ` - ${Math.round(m.scheduled_duration / 60)}m`}
                          </span>
                          {tab === "upcoming" && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="h-3 w-3" />
                              Calendar
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-outline">Needs scheduling</span>
                      )}
                      {m.department && (
                        <span className="flex items-center gap-1 text-xs">
                          &middot; {m.department}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-4 shrink-0 ml-4">
                  {m.participants && m.participants.length > 0 && (
                    <div className="hidden sm:flex -space-x-3">
                      {m.participants.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className="w-9 h-9 rounded-full border-2 border-surface bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container"
                        >
                          {(p.users?.name?.[0] ?? p.user_id[0]).toUpperCase()}
                        </div>
                      ))}
                      {m.participants.length > 3 && (
                        <div className="w-9 h-9 rounded-full border-2 border-surface bg-surface-variant flex items-center justify-center text-xs font-bold text-muted-foreground">
                          +{m.participants.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                  {isLive ? (
                    <span className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors">
                      Join
                    </span>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="text-muted-foreground hover:text-primary p-2 transition-colors rounded-lg hover:bg-secondary-container">
                        <MoreVertical className="h-5 w-5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {tab === "upcoming" && (
                          <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(googleCalUrl(m as { title: string; scheduled_at: string; scheduled_duration?: number }), "_blank", "noopener"); }}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Google Calendar
                          </DropdownMenuItem>
                        )}
                        {tab === "upcoming" && (
                          <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQrUrl(googleCalUrl(m as { title: string; scheduled_at: string; scheduled_duration?: number })); setQrOpen(true); }}>
                            <QrCode className="h-4 w-4 mr-2" />
                            QR Code
                          </DropdownMenuItem>
                        )}
                        {(m.share_token) && (
                          <DropdownMenuItem onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            navigator.clipboard.writeText(`${window.location.origin}/live/${m.share_token}`);
                            toast.success("Share link copied");
                          }}>
                            <Share2 className="h-4 w-4 mr-2" />
                            Copy Share Link
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="h-12" />
      </div>

      {/* Mobile FAB */}
      {isAdmin && (
        <Link href="/meetings/new" className="fixed bottom-6 right-6 md:hidden z-30">
          <Button className="h-14 w-14 rounded-full shadow-lg">
            <Plus className="h-6 w-6" />
          </Button>
        </Link>
      )}

      <QrDialog open={qrOpen} onOpenChange={setQrOpen} url={qrUrl} />
    </div>
  );
}

function QrDialog({ open, onOpenChange, url }: { open: boolean; onOpenChange: (v: boolean) => void; url: string }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!open || !url) { setDataUrl(""); return; }
    QRCode.toDataURL(url, {
      width: 280, margin: 1, color: { dark: "#4a7c59", light: "#ffffff" },
    }).then(setDataUrl);
  }, [open, url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Calendar</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center py-6">
          {dataUrl ? <img src={dataUrl} alt="QR Code" className="rounded-xl" width={280} height={280} /> : <div className="h-[280px] w-[280px] animate-pulse rounded-xl bg-muted" />}
        </div>
        <div className="text-center text-sm text-muted-foreground break-all px-2 font-medium">
          {url}
        </div>
      </DialogContent>
    </Dialog>
  );
}
