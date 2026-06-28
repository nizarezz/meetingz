import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { captureException } from "../_shared/sentry.ts";

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
      .select(`
        id, status, scheduled_duration,
        team_id
      `)
      .eq("id", meetingId)
      .is("deleted_at", null)
      .single();

    if (fetchErr) return err("Meeting not found", 404);
    if (meeting.team_id !== caller.team_id) return err("Forbidden", 403);

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
      is_timer_running: false,
      paused_at: null,
      timer_started_at: null,
      timer_base_total: 0,
      timer_item_started_at: null,
      timer_base_item: 0,
      active_item_index: 0,
    };

    const meetingWithTimer = { ...meeting, agenda_items: agendaItems ?? [], ...timer };

    if (req.method === "GET") {
      return ok(computeState(meetingWithTimer));
    }

    if (req.method !== "POST") return err("Method not allowed", 405);

    requireRole(caller, TIMER_ROLES);
    checkRateLimit(`timer:actions:${caller.team_id}`, 120, "timer actions");

    const now = new Date().toISOString();

    if (action === "start") {
      if (timer.is_timer_running) return err("Timer is already running");
      if (!["planned", "active"].includes(meeting.status)) {
        return err("Can only start a planned or active meeting");
      }

      const patch: Record<string, unknown> = {
        is_timer_running:      true,
        timer_started_at:      now,
        timer_item_started_at: now,
        timer_base_total:      0,
        timer_base_item:       0,
        active_item_index:     0,
        paused_at:             null,
      };

      return applyPatch(svc, meetingId, patch, { status: "active" });
    }

    if (action === "pause") {
      if (!timer.is_timer_running) return err("Timer is not running");

      const nowDate    = new Date();
      const elapsedTotal = computeElapsedTotal(meetingWithTimer, nowDate);
      const elapsedItem  = computeElapsedItem(meetingWithTimer, nowDate);

      return applyPatch(svc, meetingId, {
        is_timer_running:  false,
        paused_at:         now,
        timer_base_total:  elapsedTotal,
        timer_base_item:   elapsedItem,
        timer_started_at:  null,
        timer_item_started_at: null,
      });
    }

    if (action === "resume") {
      if (timer.is_timer_running) return err("Timer is already running");
      if (meeting.status !== "active") return err("Meeting is not active");

      return applyPatch(svc, meetingId, {
        is_timer_running:      true,
        timer_started_at:      now,
        timer_item_started_at: now,
        paused_at:             null,
      });
    }

    if (action === "next-item") {
      if (!timer.is_timer_running) return err("Timer is not running");

      const agendaItems = meeting.agenda_items as unknown[];
      const nextIndex   = (timer.active_item_index ?? 0) + 1;

      if (nextIndex >= agendaItems.length) {
        return err("Already on the last agenda item");
      }

      const nowDate     = new Date();
      const elapsedTotal = computeElapsedTotal(meetingWithTimer, nowDate);

      return applyPatch(svc, meetingId, {
        active_item_index:     nextIndex,
        timer_item_started_at: now,
        timer_base_item:       0,
        timer_started_at:      now,
        timer_base_total:      elapsedTotal,
      });
    }

    if (action === "reset") {
      requireRole(caller, SUPER_ADMIN_ROLES);

      return applyPatch(svc, meetingId, {
        is_timer_running:      false,
        timer_started_at:      null,
        timer_item_started_at: null,
        timer_base_total:      0,
        timer_base_item:       0,
        active_item_index:     0,
        paused_at:             null,
      }, { status: "active", actual_duration: 0 });
    }

    if (action === "end") {
      const nowDate = new Date();
      const elapsedTotal = computeElapsedTotal(meetingWithTimer, nowDate);
      const scheduleDelay = meeting.scheduled_at
        ? Math.max(0, Math.floor((nowDate.getTime() - new Date(meeting.scheduled_at as string).getTime()) / 1000))
        : 0;
      const overrun = Math.max(0, Math.floor(elapsedTotal - (meeting.scheduled_duration as number)));

      return applyPatch(svc, meetingId, {
        is_timer_running:      false,
        timer_started_at:      null,
        timer_item_started_at: null,
        paused_at:             null,
        timer_base_total:      elapsedTotal,
      }, {
        status: "completed",
        actual_duration: Math.floor(elapsedTotal),
        schedule_delay_seconds: scheduleDelay,
        overrun_seconds: overrun,
      });
    }

    if (action === "add-time") {
      const body = await req.json();
      const extra = Math.max(1, Math.min(60, body?.seconds ?? 60));
      const nowDate = new Date();
      const elapsedItem = computeElapsedItem(meetingWithTimer, nowDate);

      return applyPatch(svc, meetingId, {
        timer_base_item: elapsedItem + extra,
      });
    }

    return err("Unknown action", 404);

  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "timer" });
    console.error(e);
    return err("Internal server error", 500);
  }
});

function computeElapsedTotal(meeting: Record<string, unknown>, now: Date): number {
  const base = (meeting.timer_base_total as number) ?? 0;
  if (!meeting.timer_started_at) return base;
  const diff = (now.getTime() - new Date(meeting.timer_started_at as string).getTime()) / 1000;
  return Math.floor(base + diff);
}

function computeElapsedItem(meeting: Record<string, unknown>, now: Date): number {
  const base = (meeting.timer_base_item as number) ?? 0;
  if (!meeting.timer_item_started_at) return base;
  const diff = (now.getTime() - new Date(meeting.timer_item_started_at as string).getTime()) / 1000;
  return Math.floor(base + diff);
}

function computeState(meeting: Record<string, unknown>) {
  const now    = new Date();
  const running = meeting.is_timer_running as boolean;

  const elapsed_total = running ? computeElapsedTotal(meeting, now) : (meeting.timer_base_total as number ?? 0);
  const elapsed_item  = running ? computeElapsedItem(meeting, now)  : (meeting.timer_base_item  as number ?? 0);
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
  };
}

const TIMER_FIELDS = new Set([
  "is_timer_running", "timer_started_at", "timer_item_started_at",
  "timer_base_total", "timer_base_item", "active_item_index", "paused_at",
]);

async function applyPatch(
  svc: ReturnType<typeof serviceClient>,
  meetingId: string,
  patch: Record<string, unknown>,
  meetingPatch?: Record<string, unknown>
): Promise<Response> {
  const timerPatch: Record<string, unknown> = {};
  const restPatch: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(patch)) {
    if (TIMER_FIELDS.has(key)) {
      timerPatch[key] = val;
    } else {
      restPatch[key] = val;
    }
  }

  if (meetingPatch) Object.assign(restPatch, meetingPatch);

  if (Object.keys(timerPatch).length > 0) {
    timerPatch.updated_at = new Date().toISOString();
    const { error: tErr } = await svc
      .from("meeting_timer_state")
      .upsert({ meeting_id: meetingId, ...timerPatch }, { onConflict: "meeting_id" })
      .select()
      .single();

    if (tErr) return err(tErr.message);
  }

  if (Object.keys(restPatch).length > 0) {
    const { data, error } = await svc
      .from("meetings")
      .update(restPatch)
      .eq("id", meetingId)
      .select()
      .single();

    if (error) return err(error.message);
    return ok(computeState({ ...data, ...timerPatch }));
  }

  const { data: meeting } = await svc
    .from("meetings")
    .select("id, status, scheduled_duration")
    .eq("id", meetingId)
    .single();

  const { data: items } = await svc
    .from("agenda_items")
    .select("title, duration")
    .eq("meeting_id", meetingId)
    .order("sort_order", { ascending: true });

  return ok(computeState({ ...meeting, agenda_items: items ?? [], ...timerPatch }));
}
