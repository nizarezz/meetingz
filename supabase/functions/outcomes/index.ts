import { ok, err, preflight } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES } from "../_shared/auth.ts";

const VALID_OUTCOMES = ["Decision Made", "Action Items Assigned", "Postponed"] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller    = await resolveCaller(req);
    const url       = new URL(req.url);
    const parts     = url.pathname.replace(/^\/outcomes\/?/, "").split("/").filter(Boolean);
    const meetingId = parts[0];

    if (!meetingId) return err("meetingId is required");

    if (req.method === "GET") {
      const { data, error } = await userClient(req)
        .from("outcomes")
        .select("id, meeting_id, primary_outcome, action_items, notes, logged_by, team_id, created_at")
        .eq("meeting_id", meetingId)
        .maybeSingle();

      if (error) return err(error.message);
      return ok(data ?? null);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);

      const body = await req.json();
      const { primary_outcome, action_items = [], notes } = body;

      if (!primary_outcome) return err("primary_outcome is required");
      if (!VALID_OUTCOMES.includes(primary_outcome)) {
        return err(`primary_outcome must be one of: ${VALID_OUTCOMES.join(", ")}`);
      }

      const svc = serviceClient();

      const { data: meeting, error: meetingErr } = await svc
        .from("meetings")
        .select("id, status, team_id")
        .eq("id", meetingId)
        .is("deleted_at", null)
        .single();

      if (meetingErr || !meeting) return err("Meeting not found", 404);
      if (meeting.team_id !== caller.team_id) return err("Forbidden", 403);
      if (meeting.status !== "completed") {
        return err("Can only log outcomes for completed meetings");
      }

      const { data: outcome, error: insertErr } = await svc
        .from("outcomes")
        .insert({
          meeting_id:      meetingId,
          primary_outcome,
          action_items,
          notes:           notes ?? null,
          logged_by:       caller.id,
          team_id:         caller.team_id,
        })
        .select()
        .single();

      if (insertErr) return err(insertErr.message);

      await svc
        .from("meetings")
        .update({ status: "logged" })
        .eq("id", meetingId);

      return ok(outcome, 201);
    }

    if (req.method === "PATCH") {
      requireRole(caller, ADMIN_ROLES);
      const body = await req.json();
      const { primary_outcome, action_items, notes } = body;

      if (primary_outcome && !VALID_OUTCOMES.includes(primary_outcome)) {
        return err(`primary_outcome must be one of: ${VALID_OUTCOMES.join(", ")}`);
      }

      const patch: Record<string, unknown> = {};
      if (primary_outcome !== undefined) patch.primary_outcome = primary_outcome;
      if (action_items     !== undefined) patch.action_items   = action_items;
      if (notes            !== undefined) patch.notes          = notes;

      if (Object.keys(patch).length === 0) return err("No fields to update");

      const { data, error } = await userClient(req)
        .from("outcomes")
        .update(patch)
        .eq("meeting_id", meetingId)
        .select("id, meeting_id, primary_outcome, action_items, notes, logged_by, team_id, created_at")
        .maybeSingle();

      if (error) return err(error.message);
      if (!data) return err("No outcome found for this meeting", 404);
      return ok(data);
    }

    return err("Method not allowed", 405);

  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
