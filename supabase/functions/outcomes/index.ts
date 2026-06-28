import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createOutcomeSchema } from "../_shared/validate.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

async function queueAssignmentEmails(
  svc: ReturnType<typeof serviceClient>,
  items: Array<{ text: string; assignee_id?: string | null; assignee_email?: string | null; due_date?: string | null }>,
  meeting: { id: string; title: string },
  assignedBy: { email: string; name: string | null },
) {
  const baseUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
  const jobs: Array<{ type: string; payload: Record<string, unknown>; status: string }> = [];

  for (const a of items) {
    const to = a.assignee_id
      ? (await svc.from("users").select("email").eq("id", a.assignee_id).maybeSingle()).data?.email
      : a.assignee_email;
    if (!to || !a.text.trim()) continue;

    jobs.push({
      type: "send-email",
      payload: {
        to,
        template: "action-item-assigned",
        subject: `Action item: ${a.text}`,
        data: JSON.stringify({
          name: to,
          item: a.text,
          meetingTitle: meeting.title,
          dueDate: a.due_date ?? undefined,
          meetingUrl: `${baseUrl}/meetings/${meeting.id}`,
          assignedBy: assignedBy.name ?? assignedBy.email,
        }),
        replyTo: assignedBy.email,
      },
      status: "pending",
    });
  }

  if (jobs.length > 0) {
    const { error } = await svc.from("job_queue").insert(jobs);
    if (error) console.error("Failed to queue assignment emails:", error);
    else console.log(`Queued ${jobs.length} assignment emails`);
  }
}

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
      const { data: outcome, error } = await caller.client
        .from("outcomes")
        .select("id, meeting_id, primary_outcome, notes, logged_by, team_id, created_at")
        .eq("meeting_id", meetingId)
        .maybeSingle();

      if (error) return err(error.message);

      if (outcome) {
        const { data: items } = await caller.client
          .from("action_items")
          .select("id, text, assignee_email, assignee_id, due_date, done")
          .eq("outcome_id", outcome.id)
          .order("created_at", { ascending: true });

        return ok({ ...outcome, action_items: items ?? [] });
      }

      return ok(null);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`outcomes:create:${caller.team_id}`, 30, "outcome creates");

      const body = await req.json().catch(() => ({}));
      const parsed = parse(createOutcomeSchema, body);
      const { primary_outcome, action_items = [], notes } = parsed;

      if (!primary_outcome) return err("primary_outcome is required");
      if (!VALID_OUTCOMES.includes(primary_outcome)) {
        return err(`primary_outcome must be one of: ${VALID_OUTCOMES.join(", ")}`);
      }

      const svc = serviceClient();

      const { data: meeting, error: meetingErr } = await caller.client
        .from("meetings")
        .select("id, title, status, team_id")
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
          meeting_id: meetingId,
          primary_outcome,
          notes: notes ?? null,
          logged_by: caller.id,
          team_id: caller.team_id,
        })
        .select()
        .single();

      if (insertErr) return err(insertErr.message);

      if (action_items.length > 0) {
        const rows = action_items.map((a: {
          text: string; assignee_id?: string; assignee_email?: string; due_date?: string; done?: boolean
        }) => ({
          outcome_id: outcome.id,
          meeting_id: meetingId,
          text: a.text,
          assignee_id: a.assignee_id || null,
          assignee_email: a.assignee_email || null,
          due_date: a.due_date || null,
          done: a.done ?? false,
          team_id: caller.team_id,
        }));

        const { error: aiErr } = await svc.from("action_items").insert(rows);
        if (aiErr) return err(aiErr.message);

        try {
          const { data: profile } = await caller.client
            .from("users")
            .select("email, name")
            .eq("id", caller.id)
            .single();
          if (profile) {
            await queueAssignmentEmails(svc, action_items, meeting, profile);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          await captureException(msg, { context: "outcomes-email" });
          console.error("Email send error:", e);
        }
      }

      await svc
        .from("meetings")
        .update({ status: "logged" })
        .eq("id", meetingId);

      await audit(caller.id, caller.team_id, "outcome_create", "outcome", outcome.id, { primary_outcome, meeting_id: meetingId });
      return ok({ ...outcome, action_items }, 201);
    }

    if (req.method === "PATCH") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`outcomes:update:${caller.team_id}`, 30, "outcome updates");
      const body = await req.json();
      const { primary_outcome, action_items, notes } = body;
      const svc = serviceClient();

      if (primary_outcome && !VALID_OUTCOMES.includes(primary_outcome)) {
        return err(`primary_outcome must be one of: ${VALID_OUTCOMES.join(", ")}`);
      }

      const patch: Record<string, unknown> = {};
      if (primary_outcome !== undefined) patch.primary_outcome = primary_outcome;
      if (notes !== undefined) patch.notes = notes;

      if (Object.keys(patch).length === 0 && action_items === undefined) {
        return err("No fields to update");
      }

      const { data: outcome, error: fetchErr } = await caller.client
        .from("outcomes")
        .select("id, meeting_id, primary_outcome, notes, logged_by, team_id, created_at")
        .eq("meeting_id", meetingId)
        .maybeSingle();

      if (fetchErr) return err(fetchErr.message);
      if (!outcome) return err("No outcome found for this meeting", 404);

      if (Object.keys(patch).length > 0) {
        const { error: updateErr } = await svc
          .from("outcomes")
          .update(patch)
          .eq("id", outcome.id);
        if (updateErr) return err(updateErr.message);
      }

      if (action_items !== undefined) {
        await svc.from("action_items").delete().eq("outcome_id", outcome.id);

        if (action_items.length > 0) {
          const rows = action_items.map((a: {
            text: string; assignee_id?: string; assignee_email?: string; due_date?: string; done?: boolean
          }) => ({
            outcome_id: outcome.id,
            meeting_id: meetingId,
            text: a.text,
            assignee_id: a.assignee_id || null,
            assignee_email: a.assignee_email || null,
            due_date: a.due_date || null,
            done: a.done ?? false,
            team_id: caller.team_id,
          }));

          const { error: aiErr } = await svc.from("action_items").insert(rows);
          if (aiErr) return err(aiErr.message);
        }

        try {
          const { data: meetingTitle } = await caller.client
            .from("meetings")
            .select("title")
            .eq("id", meetingId)
            .single();
          const { data: profile } = await caller.client
            .from("users")
            .select("email, name")
            .eq("id", caller.id)
            .single();
          if (meetingTitle && profile) {
            await queueAssignmentEmails(svc, action_items, { id: meetingId, title: meetingTitle.title }, profile);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          await captureException(msg, { context: "outcomes-email" });
          console.error("Email send error:", e);
        }
      }

      const { data: items } = await caller.client
        .from("action_items")
        .select("id, text, assignee_email, assignee_id, due_date, done")
        .eq("outcome_id", outcome.id)
        .order("created_at", { ascending: true });

      await audit(caller.id, caller.team_id, "outcome_update", "outcome", meetingId, { primary_outcome: patch.primary_outcome });
      return ok({ ...outcome, action_items: items ?? [] });
    }

    return err("Method not allowed", 405);

  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "outcomes" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
