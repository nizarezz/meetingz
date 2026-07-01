import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const TIMER_ROLES = ADMIN_ROLES;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/timer\/?/, "").split("/").filter(Boolean);
    const meetingId = parts[0];
    const action    = parts[1] ?? null;

    if (!meetingId) return err("meetingId is required");

    const svc = serviceClient();
    const { data: meeting, error: fetchErr } = await caller.client
      .from("meetings")
      .select("id, status, team_id, facilitator_id, created_by, timer_open_to_all, scheduled_duration")
      .eq("id", meetingId)
      .is("deleted_at", null)
      .single();

    if (fetchErr) return err("Meeting not found", 404);
    if (meeting.team_id !== caller.team_id) return err("Forbidden", 403);

    const isHost = meeting.facilitator_id === caller.id || meeting.created_by === caller.id;

    // GET — read timer state directly (cheap, no RPC needed)
    if (req.method === "GET") {
      const { data: agendaItems } = await caller.client
        .from("agenda_items")
        .select("title, duration")
        .eq("meeting_id", meetingId)
        .order("sort_order", { ascending: true });

      const { data: timerState } = await caller.client
        .from("meeting_timer_state")
        .select("*")
        .eq("meeting_id", meetingId)
        .maybeSingle();

      const timer = timerState ?? {
        is_timer_running: false, paused_at: null, timer_started_at: null,
        timer_base_total: 0, timer_item_started_at: null, timer_base_item: 0,
        active_item_index: 0, version: 1,
      };

      const meetingData = { ...meeting, agenda_items: agendaItems ?? [], ...timer };
      return ok(computeState(meetingData));
    }

    if (req.method !== "POST") return err("Method not allowed", 405);

    requireRole(caller, TIMER_ROLES);

    // Host-only control when timer_open_to_all is false
    if (!meeting.timer_open_to_all && !isHost) {
      return err("Only the meeting host can control the timer", 403);
    }

    checkRateLimit(`timer:actions:${caller.team_id}`, 120, "timer actions");

    // Reset requires super_admin
    if (action === "reset") {
      requireRole(caller, SUPER_ADMIN_ROLES);
    }

    // Fetch current version for optimistic lock
    const { data: current } = await svc
      .from("meeting_timer_state")
      .select("version")
      .eq("meeting_id", meetingId)
      .maybeSingle();

    const expectedVersion = current?.version ?? 1;

    // Parse extra seconds for add-time
    let extraSeconds = 0;
    if (action === "add-time") {
      const body = await req.json().catch(() => ({}));
      extraSeconds = Math.max(1, Math.min(60, body?.seconds ?? 60));
    }

    const { data: rpcResult, error: rpcErr } = await caller.client.rpc("timer_action", {
      p_meeting_id: meetingId,
      p_action: action,
      p_extra_seconds: extraSeconds,
      p_expected_version: expectedVersion,
    });

    if (rpcErr) return err(rpcErr.message);
    return ok(rpcResult);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(e);
    return err("Internal server error", 500);
  }
});

function computeState(meeting: Record<string, unknown>) {
  const now    = new Date();
  const running = meeting.is_timer_running as boolean;

  const elapsed_total = running ? computeElapsed(meeting.timer_started_at as string | null, meeting.timer_base_total as number ?? 0, now) : (meeting.timer_base_total as number ?? 0);
  const elapsed_item  = running ? computeElapsed(meeting.timer_item_started_at as string | null, meeting.timer_base_item  as number ?? 0, now) : (meeting.timer_base_item  as number ?? 0);
  const scheduled     = (meeting.scheduled_duration as number) ?? 0;
  const items         = (meeting.agenda_items as { duration?: number }[]) ?? [];
  const activeIdx     = (meeting.active_item_index as number) ?? 0;
  const currentItem   = items[activeIdx];
  const item_budget   = currentItem?.duration ?? null;

  return {
    is_running:          running,
    elapsed_total,
    remaining_total:     Math.max(0, scheduled - elapsed_total),
    over_budget:         elapsed_total > scheduled,
    elapsed_item,
    remaining_item:      item_budget != null ? Math.max(0, item_budget - elapsed_item) : null,
    active_item_index:   activeIdx,
    active_item:         currentItem ?? null,
    paused_at:           meeting.paused_at,
    timer_started_at:      meeting.timer_started_at,
    timer_item_started_at: meeting.timer_item_started_at,
    timer_base_total:      meeting.timer_base_total,
    timer_base_item:       meeting.timer_base_item,
    version:               meeting.version ?? 1,
  };
}

function computeElapsed(startedAt: string | null, base: number, now: Date): number {
  if (!startedAt) return base;
  return Math.floor(base + (now.getTime() - new Date(startedAt).getTime()) / 1000);
}
