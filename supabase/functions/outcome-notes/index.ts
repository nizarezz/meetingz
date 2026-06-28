import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireHostOrSuperAdmin, requireMeetingOpen } from "../_shared/auth.ts";
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
        .order("sort_order", { ascending: true });

      if (error) return err(error.message);
      return ok(data ?? []);
    }

    // --- POST (create) ---
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const parsed = parse(createOutcomeNoteSchema, body);

      await requireHostOrSuperAdmin(caller, parsed.meeting_id, svc);
      await requireMeetingOpen(parsed.meeting_id, svc);

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

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "outcome_notes" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
