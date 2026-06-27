import { ok, err, preflight } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";

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
    const { data: meeting, error: fetchErr } = await svc
      .from("meetings")
      .select(`
        id, status, scheduled_duration, actual_duration,
        is_timer_running, paused_at,
        timer_started_at, timer_base_total,
        timer_item_started_at, timer_base_item,
        active_item_index, agenda_items, team_id
      `)
      .eq("id", meetingId)
      .is("deleted_at", null)
      .single();

    if (fetchErr) return err("Meeting not found", 404);
    if (meeting.team_id !== caller.team_id) return err("Forbidden", 403);

    if (req.method === "GET") {
      return ok(computeState(meeting));
    }

    if (req.method !== "POST") return err("Method not allowed", 405);

    requireRole(caller, TIMER_ROLES);

    const now = new Date().toISOString();

    if (action === "start") {
      if (meeting.is_timer_running) return err("Timer is already running");
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
        status:                "active",
      };

      return applyPatch(svc, meetingId, patch);
    }

    if (action === "pause") {
      if (!meeting.is_timer_running) return err("Timer is not running");

      const nowDate    = new Date();
      const elapsedTotal = computeElapsedTotal(meeting, nowDate);
      const elapsedItem  = computeElapsedItem(meeting, nowDate);

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
      if (meeting.is_timer_running) return err("Timer is already running");
      if (meeting.status !== "active") return err("Meeting is not active");

      return applyPatch(svc, meetingId, {
        is_timer_running:      true,
        timer_started_at:      now,
        timer_item_started_at: now,
        paused_at:             null,
      });
    }

    if (action === "next-item") {
      if (!meeting.is_timer_running) return err("Timer is not running");

      const agendaItems = meeting.agenda_items as unknown[];
      const nextIndex   = (meeting.active_item_index ?? 0) + 1;

      if (nextIndex >= agendaItems.length) {
        return err("Already on the last agenda item");
      }

      const nowDate     = new Date();
      const elapsedTotal = computeElapsedTotal(meeting, nowDate);

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
        status:                "active",
        actual_duration:       0,
      });
    }

    return err("Unknown action", 404);

  } catch (e) {
    if (e instanceof Response) return e;
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

async function applyPatch(
  svc: ReturnType<typeof serviceClient>,
  meetingId: string,
  patch: Record<string, unknown>
): Promise<Response> {
  const { data, error } = await svc
    .from("meetings")
    .update(patch)
    .eq("id", meetingId)
    .select()
    .single();

  if (error) return err(error.message);
  return ok(computeState(data));
}
