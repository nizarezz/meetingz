import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return err("Method not allowed", 405);

  try {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${Deno.env.get("CRON_SECRET")}`) {
      return err("Unauthorized", 401);
    }

    const svc = serviceClient();
    const now = new Date().toISOString().slice(0, 10);

    const { data: overdue, error: fetchErr } = await svc
      .from("action_items")
      .select("id, meeting_id, text, assignee_id, assignee_email, team_id")
      .eq("status", "pending")
      .not("due_date", "is", null)
      .lt("due_date", now);

    if (fetchErr) return err(fetchErr.message);

    if (!overdue?.length) return ok({ marked_overdue: 0 });

    const ids = overdue.map((a: { id: string }) => a.id);

    const { error: updateErr } = await svc
      .from("action_items")
      .update({ status: "overdue" })
      .in("id", ids);

    if (updateErr) return err(updateErr.message);

    const notifications: Array<Record<string, unknown>> = [];

    for (const item of overdue) {
      const targets = new Set<string>();
      if (item.assignee_id) targets.add(item.assignee_id);
      if (item.assignee_email && !item.assignee_id) {
        const { data: u } = await svc
          .from("users")
          .select("id")
          .eq("email", item.assignee_email)
          .is("deleted_at", null)
          .maybeSingle();
        if (u) targets.add(u.id);
      }

      for (const userId of targets) {
        notifications.push({
          user_id: userId,
          type: "assignment_overdue",
          title: "Assignment overdue",
          body: `"${item.text}" is past due`,
          data: { action_item_id: item.id, meeting_id: item.meeting_id },
        });
      }
    }

    if (notifications.length > 0) {
      const { error: notifErr } = await svc
        .from("notifications")
        .insert(notifications);
      if (notifErr) console.error("Failed to insert overdue notifications:", notifErr.message);
    }

    await audit("system", overdue[0].team_id, "overdue_check", "system", null, {
      count: overdue.length,
      ids,
    });

    return ok({ marked_overdue: overdue.length });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "overdue-check" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
