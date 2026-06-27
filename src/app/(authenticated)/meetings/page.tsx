"use client";

import { useState } from "react";
import Link from "next/link";
import { useMeetings } from "@/lib/hooks/use-meetings";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Plus, Timer, CheckSquare, TrendingUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { format } from "date-fns";
import { MEETING_STATUS_BADGE } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

const PER_PAGE = 15;

export default function MeetingsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useMeetings({ page, perPage: PER_PAGE });

  const rawMeetings = data?.data ?? [];
  const total = data?.total ?? 0;
  const meetings = search
    ? rawMeetings.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()))
    : rawMeetings;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const statusIcon: Record<string, typeof Timer> = {
    planned: Timer,
    active: Timer,
    completed: CheckSquare,
    logged: TrendingUp,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-4 w-2/5" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} total meetings
          </p>
        </div>
        <Link href="/meetings/new" className={buttonVariants({})}>
          <Plus className="mr-2 h-4 w-4" /> New Meeting
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search meetings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!meetings || meetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Timer className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">
              {search ? "No meetings match your search" : "No meetings yet"}
            </p>
            {!search && <Link href="/meetings/new" className={buttonVariants({})}>Create your first meeting</Link>}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {meetings.map((m) => {
              const Icon = statusIcon[m.status] ?? Timer;
              return (
                <Link key={m.id} href={`/meetings/${m.id}`}>
                  <Card className="cursor-pointer transition hover:shadow-sm">
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.department} &middot; {m.meeting_type} &middot;{" "}
                          {m.scheduled_at
                            ? format(new Date(m.scheduled_at), "MMM d, yyyy")
                            : "No schedule"}
                        </p>
                      </div>
                      <Badge variant={MEETING_STATUS_BADGE[m.status] ?? "outline"}>
                        {m.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
