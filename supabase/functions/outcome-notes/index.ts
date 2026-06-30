import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createOutcomeNoteSchema } from "../_shared/validate.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const id = url.pathname.replace(/^\/outcome-notes\/?/, "").split("/")[0] || null;
    const svc = serviceClient();

    // --- LIST notes for an outcome ---
    if (req.method === "GET") {
      const outcomeId = url.searchParams.get("outcome_id");
      if (!outcomeId) return err("outcome_id query param is required", 400);

      const { data, error } = await svc
        .from("outcome_notes")
        .select("*, created_by_user:users!created_by(name)")
        .eq("outcome_id", outcomeId)
        .eq("team_id", caller.team_id)
        .order("created_at", { ascending: true });

      if (error) return err(error.message);
      return ok(data ?? []);
    }

    // --- POST (create) ---
    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`outcome-notes:create:${caller.team_id}`, 30, "outcome note creates");

      const body = await req.json().catch(() => ({}));
      const parsed = parse(createOutcomeNoteSchema, body);

      const { data: meeting, error: meetingErr } = await caller.client
        .from("meetings")
        .select("status, created_by, facilitator_id, timer_open_to_all")
        .eq("id", parsed.meeting_id)
        .single();

      if (meetingErr || !meeting) return err("Meeting not found", 404);

      const isHost = meeting.facilitator_id === caller.id || meeting.created_by === caller.id;
      if (!meeting.timer_open_to_all && !isHost) {
        return err("Only the meeting host can manage this meeting", 403);
      }

      if (parsed.source === "comment" && parsed.source_comment_id) {
        const { error: pullErr } = await svc
          .from("comments")
          .update({
            pulled_to_outcome: true,
            pulled_at: new Date().toISOString(),
            pulled_by: caller.id,
          })
          .eq("id", parsed.source_comment_id)
          .eq("meeting_id", parsed.meeting_id);

        if (pullErr) console.error("Failed to mark comment as pulled:", pullErr.message);
      }

      const { data: note, error: insertErr } = await svc
        .from("outcome_notes")
        .insert({
          meeting_id: parsed.meeting_id,
          outcome_id: parsed.outcome_id,
          text: parsed.text,
          sort_order: parsed.sort_order,
          source: parsed.source,
          source_comment_id: parsed.source_comment_id ?? null,
          created_by: caller.id,
          team_id: caller.team_id,
        })
        .select("*, created_by_user:users!created_by(name)")
        .single();

      if (insertErr) return err(insertErr.message);

      await audit(caller.id, caller.team_id, "outcome_note_create", "outcome_note", note.id, {
        meeting_id: parsed.meeting_id,
        outcome_id: parsed.outcome_id,
        source: parsed.source,
      });

      return ok(note, 201);
    }

    // --- PATCH (update) ---
    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);

      const { data: existing } = await svc
        .from("outcome_notes")
        .select("meeting_id")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .single();

      if (!existing) return err("Note not found", 404);

      const { data: meeting } = await caller.client
        .from("meetings")
        .select("status, created_by, facilitator_id, timer_open_to_all")
        .eq("id", existing.meeting_id)
        .single();

      if (!meeting) return err("Meeting not found", 404);

      const isHost = meeting.facilitator_id === caller.id || meeting.created_by === caller.id;
      if (!meeting.timer_open_to_all && !isHost) {
        return err("Only the meeting host can manage this meeting", 403);
      }

      const body = await req.json();
      if (!body.text?.trim()) return err("text is required");

      const { data: note, error } = await svc
        .from("outcome_notes")
        .update({ text: body.text.trim() })
        .eq("id", id)
        .select("*, created_by_user:users!created_by(name)")
        .single();

      if (error) return err(error.message);
      return ok(note);
    }

    // --- DELETE ---
    if (req.method === "DELETE" && id) {
      const { data: existing } = await svc
        .from("outcome_notes")
        .select("meeting_id")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .single();

      if (!existing) return err("Note not found", 404);

      const { data: meeting } = await caller.client
        .from("meetings")
        .select("created_by, facilitator_id")
        .eq("id", existing.meeting_id)
        .single();

      if (!meeting) return err("Meeting not found", 404);

      const isHost = meeting.facilitator_id === caller.id || meeting.created_by === caller.id;
      if (!isHost && caller.role !== "super_admin") return err("Only the host can remove notes", 403);

      const { error: delErr } = await svc.from("outcome_notes").delete().eq("id", id);
      if (delErr) return err(delErr.message);
      return ok({ deleted: true });
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "outcome_notes" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
