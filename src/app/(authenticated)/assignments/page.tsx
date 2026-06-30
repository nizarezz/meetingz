"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/auth-provider";
import { actionItemsApi } from "@/lib/api";
import type { ActionItemWithMeeting } from "@/lib/api/action-items";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeInvalidation } from "@/lib/hooks/use-realtime";
import { CheckSquare, ExternalLink, Calendar, Ban, Loader2, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getErrorMsg } from "@/lib/utils";
import { ADMIN_ROLES } from "@/lib/types";
import type { UserRole } from "@/lib/types";

type Status = "pending" | "in_progress" | "overdue" | "done" | "blocked";

const STATUS_BADGE: Record<Status, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  in_progress: "default",
  overdue: "destructive",
  done: "default",
  blocked: "destructive",
};

const SORT_ORDER: Record<Status, number> = {
  overdue: 0,
  pending: 1,
  in_progress: 1,
  done: 2,
  blocked: 3,
};

function statusFromItem(item: ActionItemWithMeeting): Status {
  if (item.status === "blocked") return "blocked";
  if (item.status === "done" || item.done) return "done";
  if (item.status === "overdue") return "overdue";
  if (item.status === "in_progress") return "in_progress";
  if (item.due_date && !item.done && new Date(item.due_date) < new Date()) return "overdue";
  return "pending";
}

export default function AssignmentsPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const myEmail = user?.email ?? "";
  const isAdmin = ADMIN_ROLES.includes(role as UserRole);

  const [tab, setTab] = useState("my-items");
  const [emailFilter, setEmailFilter] = useState(myEmail);
  const [submittedEmail, setSubmittedEmail] = useState(myEmail);

  useRealtimeInvalidation([
    { channel: "assignments", table: "action_items", events: ["*"], queryKeys: [["action_items"]] },
  ]);

  const { data: myItems, isLoading: myLoading, error: myError } = useQuery({
    queryKey: ["action_items", "my", submittedEmail],
    queryFn: async () => {
      const params: { assignee_email?: string; assignee_id?: string } = {};
      if (user?.id && submittedEmail === myEmail) {
        params.assignee_id = user.id;
      } else {
        params.assignee_email = submittedEmail || undefined;
      }
      return actionItemsApi.list(params);
    },
    enabled: tab === "my-items" && !!submittedEmail,
  });

  const { data: assignedItems, isLoading: assignedLoading, error: assignedError } = useQuery({
    queryKey: ["action_items", "assigned-by-me"],
    queryFn: () => actionItemsApi.list({ assigned_by: user?.id }),
    enabled: tab === "assigned-by-me" && isAdmin && !!user?.id,
  });

  const markDoneMutation = useMutation({
    mutationFn: (id: string) => actionItemsApi.markDone(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["action_items"] }); toast.success("Marked done"); },
    onError: async (e) => toast.error(await getErrorMsg(e)),
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => actionItemsApi.block(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["action_items"] }); toast.success("Assignment blocked"); },
    onError: async (e) => toast.error(await getErrorMsg(e)),
  });

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  async function handleMarkDone(id: string) {
    setPendingIds((s) => new Set(s).add(id));
    try { await markDoneMutation.mutateAsync(id); } finally { setPendingIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleBlock(id: string) {
    setPendingIds((s) => new Set(s).add(id));
    try { await blockMutation.mutateAsync(id); } finally { setPendingIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }

  function sortItems(items: ActionItemWithMeeting[]) {
    return [...items].sort((a, b) => {
      const sa = SORT_ORDER[statusFromItem(a)];
      const sb = SORT_ORDER[statusFromItem(b)];
      if (sa !== sb) return sa - sb;
      return new Date(b.assigned_at ?? b.due_date ?? 0).getTime() - new Date(a.assigned_at ?? a.due_date ?? 0).getTime();
    });
  }

  function groupByStatus(items: ActionItemWithMeeting[]) {
    return sortItems(items).reduce((acc, item) => {
      const s = statusFromItem(item);
      if (!acc[s]) acc[s] = [];
      acc[s].push(item);
      return acc;
    }, {} as Record<Status, ActionItemWithMeeting[]>);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Action items and assignments</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-outline-variant/40">
        <button onClick={() => setTab("my-items")} className={`pb-3 text-lg font-semibold transition-colors relative ${tab === "my-items" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>My Items</button>
        {isAdmin && <button onClick={() => setTab("assigned-by-me")} className={`pb-3 text-lg font-semibold transition-colors relative ${tab === "assigned-by-me" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>Assigned by Me</button>}
      </div>

      {tab === "my-items" && (
        <div className="mt-8 space-y-6">
          <MyItemsView
            items={myItems?.data ?? []}
            isLoading={myLoading}
            error={myError}
            emailFilter={emailFilter}
            setEmailFilter={setEmailFilter}
            setSubmittedEmail={setSubmittedEmail}
            myEmail={myEmail}
            userId={user?.id ?? ""}
            isAdmin={isAdmin}
            pendingIds={pendingIds}
            onMarkDone={handleMarkDone}
            onBlock={handleBlock}
            groupByStatus={groupByStatus}
          />
        </div>
      )}

      {isAdmin && tab === "assigned-by-me" && (
        <div className="mt-8 space-y-6">
          <AssignedByMeView
            items={assignedItems?.data ?? []}
            isLoading={assignedLoading}
            error={assignedError}
            userId={user?.id ?? ""}
            isAdmin={isAdmin}
            pendingIds={pendingIds}
            onMarkDone={handleMarkDone}
            onBlock={handleBlock}
            groupByStatus={groupByStatus}
            sortItems={sortItems}
          />
        </div>
      )}
    </div>
  );
}

function MyItemsView({
  items,
  isLoading,
  error,
  emailFilter,
  setEmailFilter,
  setSubmittedEmail,
  myEmail,
  userId,
  isAdmin,
  pendingIds,
  onMarkDone,
  onBlock,
  groupByStatus,
}: {
  items: ActionItemWithMeeting[];
  isLoading: boolean;
  error: Error | null;
  emailFilter: string;
  setEmailFilter: (v: string) => void;
  setSubmittedEmail: (v: string) => void;
  myEmail: string;
  userId: string;
  isAdmin: boolean;
  pendingIds: Set<string>;
  onMarkDone: (id: string) => void;
  onBlock: (id: string) => void;
  groupByStatus: (items: ActionItemWithMeeting[]) => Record<Status, ActionItemWithMeeting[]>;
}) {
  const grouped = groupByStatus(items);
  const sorted = Object.values(grouped).flat();

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Assignee email</Label>
          <Input
            type="email"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            className="h-9 w-72"
            placeholder="Filter by email"
          />
        </div>
        <Button size="sm" className="h-9" onClick={() => setSubmittedEmail(emailFilter)} disabled={!emailFilter.trim()}>
          Search
        </Button>
        {emailFilter !== myEmail && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setEmailFilter(myEmail); setSubmittedEmail(myEmail); }}>
            My items
          </Button>
        )}
      </div>

      {error ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-destructive">Failed to load assignments</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckSquare className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No action items found for this email</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.overdue?.length > 0 && (
            <Section title="Overdue" count={grouped.overdue.length} variant="destructive">
              {grouped.overdue.map((item) => (
                <ItemCard key={item.id} item={item} userId={userId} isAdmin={isAdmin} onMarkDone={onMarkDone} onBlock={onBlock} isPending={pendingIds.has(item.id!)} />
              ))}
            </Section>
          )}
          {((grouped.pending?.length ?? 0) + (grouped.in_progress?.length ?? 0)) > 0 && (
            <Section title="Active" count={(grouped.pending?.length ?? 0) + (grouped.in_progress?.length ?? 0)}>
              {[...(grouped.pending ?? []), ...(grouped.in_progress ?? [])].map((item) => (
                <ItemCard key={item.id} item={item} userId={userId} isAdmin={isAdmin} onMarkDone={onMarkDone} onBlock={onBlock} isPending={pendingIds.has(item.id!)} />
              ))}
            </Section>
          )}
          {grouped.done?.length > 0 && (
            <Section title="Done" count={grouped.done.length} muted>
              {grouped.done.map((item) => (
                <ItemCard key={item.id} item={item} userId={userId} isAdmin={isAdmin} onMarkDone={onMarkDone} onBlock={onBlock} isPending={pendingIds.has(item.id!)} />
              ))}
            </Section>
          )}
          {grouped.blocked?.length > 0 && (
            <Section title="Blocked" count={grouped.blocked.length} muted>
              {grouped.blocked.map((item) => (
                <ItemCard key={item.id} item={item} userId={userId} isAdmin={isAdmin} onMarkDone={onMarkDone} onBlock={onBlock} isPending={pendingIds.has(item.id!)} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function AssignedByMeView({
  items,
  isLoading,
  error,
  userId,
  isAdmin,
  pendingIds,
  onMarkDone,
  onBlock,
  groupByStatus,
  sortItems,
}: {
  items: ActionItemWithMeeting[];
  isLoading: boolean;
  error: Error | null;
  userId: string;
  isAdmin: boolean;
  pendingIds: Set<string>;
  onMarkDone: (id: string) => void;
  onBlock: (id: string) => void;
  groupByStatus: (items: ActionItemWithMeeting[]) => Record<Status, ActionItemWithMeeting[]>;
  sortItems: (items: ActionItemWithMeeting[]) => ActionItemWithMeeting[];
}) {
  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-destructive">Failed to load assignments</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-5 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <UserIcon className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">You haven&apos;t assigned any action items yet</p>
      </div>
    );
  }

  const byPerson = items.reduce((acc, item) => {
    const key = item.assignee?.email ?? item.assignee_email ?? "unknown";
    if (!acc[key]) acc[key] = { name: item.assignee?.name ?? item.assignee_email ?? "Unknown", items: [] };
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { name: string; items: ActionItemWithMeeting[] }>);

  return (
    <div className="space-y-8">
      {Object.entries(byPerson).map(([key, person]) => {
        const grouped = groupByStatus(person.items);
        const total = person.items.length;
        const pendingCount = (grouped.pending?.length ?? 0) + (grouped.in_progress?.length ?? 0) + (grouped.overdue?.length ?? 0);

        return (
          <section key={key}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {person.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-display text-lg">{person.name}</h2>
                <p className="text-xs text-muted-foreground">{total} items · {pendingCount} pending</p>
              </div>
            </div>
            <div className="space-y-3">
              {sortItems(person.items).map((item) => (
                <ItemCard key={item.id} item={item} userId={userId} isAdmin={isAdmin} onMarkDone={onMarkDone} onBlock={onBlock} isPending={pendingIds.has(item.id!)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Section({ title, count, variant, muted, children }: { title: string; count: number; variant?: "destructive"; muted?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`mb-3 font-display text-lg ${variant === "destructive" ? "text-destructive" : muted ? "text-muted-foreground" : ""}`}>
        {title} ({count})
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ItemCard({
  item,
  userId,
  isAdmin,
  onMarkDone,
  onBlock,
  isPending,
}: {
  item: ActionItemWithMeeting;
  userId: string;
  isAdmin: boolean;
  onMarkDone: (id: string) => void;
  onBlock: (id: string) => void;
  isPending: boolean;
}) {
  const status = statusFromItem(item);
  const meeting = item.meetings as { title: string; scheduled_at: string | null } | undefined;
  const isAssignee = item.assignee_id === userId;
  const canMarkDone = isAssignee && (status === "pending" || status === "in_progress" || status === "overdue");
  const canBlock = isAdmin && status !== "done" && status !== "blocked";

  return (
    <Card className={status === "done" || status === "blocked" ? "opacity-60" : ""}>
      <CardContent className="flex items-start gap-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium ${status === "done" ? "line-through text-muted-foreground" : ""}`}>
              {item.text}
            </p>
            <StatusBadge status={status} />
          </div>
          {item.priority && item.priority !== "medium" && (
            <Badge variant="outline" className={`mt-1 text-[10px] ${item.priority === "high" ? "border-amber-400 text-amber-600" : "text-muted-foreground"}`}>
              {item.priority}
            </Badge>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meeting && (
              <Link href={`/meetings/${item.meeting_id}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                <ExternalLink className="h-3 w-3" />
                {meeting.title}
              </Link>
            )}
            {item.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(item.due_date), "MMM d, yyyy")}
              </span>
            )}
            {item.assignee_email && !isAssignee && (
              <span>{item.assignee_email}</span>
            )}
            {item.assignee?.name && !isAssignee && (
              <span className="text-foreground/70">{item.assignee.name}</span>
            )}
            {status === "blocked" && item.blocked_by && (
              <span className="flex items-center gap-1 text-destructive">
                <Ban className="h-3 w-3" />
                Blocked
              </span>
            )}
          </div>
        </div>

        {canMarkDone && (
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => onMarkDone(item.id!)} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
            Mark done
          </Button>
        )}

        {canBlock && (
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-destructive hover:text-destructive" onClick={() => onBlock(item.id!)} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
            Block
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const label: Record<Status, string> = {
    pending: "Pending",
    in_progress: "In Progress",
    overdue: "Overdue",
    done: "Done",
    blocked: "Blocked",
  };
  return <Badge variant={STATUS_BADGE[status]} className="shrink-0 text-[10px]">{label[status]}</Badge>;
}
