"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/auth-provider";
import { actionItemsApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, ExternalLink, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function AssignmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const myEmail = user?.email ?? "";

  const [emailFilter, setEmailFilter] = useState(myEmail);
  const [submittedEmail, setSubmittedEmail] = useState(myEmail);

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["action_items", submittedEmail],
    queryFn: async () => {
      const params: { assignee_email?: string; assignee_id?: string } = {};
      if (user?.id && submittedEmail === myEmail) {
        params.assignee_id = user.id;
      } else {
        params.assignee_email = submittedEmail || undefined;
      }
      return actionItemsApi.list(params);
    },
    enabled: !!submittedEmail,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      actionItemsApi.update(id, { done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["action_items"] }),
  });

  const doneItems = items?.data?.filter((i) => i.done) ?? [];
  const pendingItems = items?.data?.filter((i) => !i.done) ?? [];
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdueItems = pendingItems.filter((i) => i.due_date && new Date(i.due_date) < today);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Action items assigned to you</p>
        </div>
      </div>

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
        <Button
          size="sm"
          className="h-9"
          onClick={() => setSubmittedEmail(emailFilter)}
          disabled={!emailFilter.trim()}
        >
          Search
        </Button>
        {emailFilter !== myEmail && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => { setEmailFilter(myEmail); setSubmittedEmail(myEmail); }}
          >
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
      ) : items && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckSquare className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No action items found for this email</p>
        </div>
      ) : (
        <div className="space-y-8">
          {overdueItems.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg text-destructive">Overdue ({overdueItems.length})</h2>
              <div className="space-y-3">
                {overdueItems.map((item) => (
                  <ItemCard key={item.id} item={item} toggleMutation={toggleMutation} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-lg">Pending ({pendingItems.length})</h2>
            {pendingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">All caught up!</p>
            ) : (
              <div className="space-y-3">
                {pendingItems.map((item) => (
                  <ItemCard key={item.id} item={item} toggleMutation={toggleMutation} />
                ))}
              </div>
            )}
          </section>

          {doneItems.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg text-muted-foreground">Done ({doneItems.length})</h2>
              <div className="space-y-3">
                {doneItems.map((item) => (
                  <ItemCard key={item.id} item={item} toggleMutation={toggleMutation} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  toggleMutation,
}: {
  item: Awaited<ReturnType<typeof actionItemsApi.list>>["data"][number];
  toggleMutation: ReturnType<typeof useMutation<unknown, Error, { id: string; done: boolean }>>;
}) {
  const isOverdue = item.due_date && !item.done && new Date(item.due_date) < new Date();
  const meeting = item.meetings as { title: string; scheduled_at: string | null } | undefined;

  return (
    <Card className={`transition ${item.done ? "opacity-60" : ""}`}>
      <CardContent className="flex items-start gap-4 py-4">
        <Checkbox
          checked={item.done}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ id: item.id!, done: checked as boolean })
          }
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>
              {item.text}
            </p>
            {isOverdue && <Badge variant="destructive" className="shrink-0 text-[10px]">Overdue</Badge>}
          </div>
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
            {item.assignee_email && (
              <span className="text-[10px]">{item.assignee_email}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
