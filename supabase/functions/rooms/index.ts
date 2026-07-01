import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/rooms\/?/, "").split("/").filter(Boolean);
    const id     = parts[0] ?? null;

    const svc = serviceClient();

    if (req.method === "GET" && url.pathname.endsWith("/check-conflict")) {
      const roomId = url.searchParams.get("room_id");
      const scheduledAt = url.searchParams.get("scheduled_at");
      const scheduledDuration = url.searchParams.get("scheduled_duration");
      const excludeMeetingId = url.searchParams.get("exclude_meeting_id");

      if (!roomId || !scheduledAt || !scheduledDuration) {
        return err("room_id, scheduled_at, and scheduled_duration are required", 400);
      }

      const start = new Date(scheduledAt);
      const durationSec = parseInt(scheduledDuration, 10);
      if (isNaN(start.getTime()) || isNaN(durationSec)) {
        return err("Invalid scheduled_at or scheduled_duration", 400);
      }
      const end = new Date(start.getTime() + durationSec * 1000);

      const endStr = end.toISOString();
      const startStr = start.toISOString();

      const { data: conflicts, error } = await svc
        .from("meetings")
        .select("id, title, scheduled_at, scheduled_duration")
        .eq("room_id", roomId)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .not("status", "eq", "cancelled")
        .lt("scheduled_at", endStr)
        .gt("scheduled_at + (scheduled_duration || ' seconds')::interval", startStr)
        .order("scheduled_at", { ascending: true });

      if (error) return err(error.message);

      const filtered = (conflicts ?? []).filter((m) => m.id !== excludeMeetingId);
      return ok(filtered);
    }

    if (req.method === "GET" && !id) {
      const { data, error } = await caller.client
        .from("rooms")
        .select("id, name, is_active, created_at")
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) return err(error.message);
      return ok(data ?? []);
    }

    if (req.method === "GET" && id) {
      const { data, error } = await caller.client
        .from("rooms")
        .select("id, name, is_active, created_at")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (error || !data) return err("Room not found", 404);
      return ok(data);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`rooms:create:${caller.team_id}`, 30, "room creates");

      const body = await req.json().catch(() => ({}));
      const name = (body.name ?? "").trim();
      if (!name) return err("Room name is required", 400);

      const { count, error: countErr } = await svc
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("team_id", caller.team_id)
        .is("deleted_at", null);

      if (countErr) return err(countErr.message);
      if (count != null && count >= 2) return err("Maximum 2 rooms allowed", 400);

      const { data: room, error: insertErr } = await svc
        .from("rooms")
        .insert({ name, team_id: caller.team_id })
        .select("id, name, is_active, created_at")
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") return err("A room with this name already exists", 409);
        return err(insertErr.message);
      }

      await audit(caller.id, caller.team_id, "room_create", "room", room.id, { name });
      return ok(room, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`rooms:update:${caller.team_id}`, 30, "room updates");

      const { data: existing } = await svc
        .from("rooms")
        .select("id")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (!existing) return err("Room not found", 404);

      const body = await req.json();
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      if (Object.keys(patch).length === 0) return err("No valid fields to update", 400);

      const { data: room, error } = await svc
        .from("rooms")
        .update(patch)
        .eq("id", id)
        .select("id, name, is_active, created_at")
        .single();

      if (error) {
        if (error.code === "23505") return err("A room with this name already exists", 409);
        return err(error.message);
      }

      await audit(caller.id, caller.team_id, "room_update", "room", id, patch);
      return ok(room);
    }

    if (req.method === "DELETE" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`rooms:delete:${caller.team_id}`, 10, "room deletions");

      const { data: existing } = await svc
        .from("rooms")
        .select("id")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (!existing) return err("Room not found", 404);

      const { error: delErr } = await svc
        .from("rooms")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", id);

      if (delErr) return err(delErr.message);
      await audit(caller.id, caller.team_id, "room_delete", "room", id, {});
      return ok({ deleted: true });
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "rooms" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
