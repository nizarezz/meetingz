import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/action_items\/?/, "").split("/").filter(Boolean);
    const svc = serviceClient();

    if (req.method === "GET") {
      const assigneeId    = url.searchParams.get("assignee_id");
      const assigneeEmail = url.searchParams.get("assignee_email");
      const page    = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from    = (page - 1) * perPage;
      const to      = from + perPage - 1;

      let query = svc
        .from("action_items")
        .select("id, meeting_id, outcome_id, text, assignee_email, assignee_id, due_date, done, created_at, meetings!inner(title, scheduled_at)", { count: "exact" })
        .eq("team_id", caller.team_id);

      if (assigneeId) {
        query = query.eq("assignee_id", assigneeId);
      } else if (assigneeEmail) {
        query = query.eq("assignee_email", assigneeEmail);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    if (req.method === "PATCH" && parts.length === 1) {
      checkRateLimit(`action_items:update:${caller.team_id}`, 60, "action item updates");
      const itemId = parts[0];
      const body = await req.json();

      const { data: item } = await svc
        .from("action_items")
        .select("id, assignee_id, assignee_email, team_id")
        .eq("id", itemId)
        .single();

      if (!item) return err("Action item not found", 404);
      if (item.team_id !== caller.team_id) return err("Not found", 404);

      const isAssignee = item.assignee_id === caller.id;
      const isAdmin = ADMIN_ROLES.includes(caller.role as typeof ADMIN_ROLES[number]);
      if (!isAssignee && !isAdmin) return err("Insufficient permissions", 403);

      const { error: updateErr } = await svc
        .from("action_items")
        .update(body)
        .eq("id", itemId);

      if (updateErr) return err(updateErr.message);

      const { data: updated, error: fetchErr } = await svc
        .from("action_items")
        .select("id, meeting_id, outcome_id, text, assignee_email, assignee_id, due_date, done, created_at, meetings!inner(title, scheduled_at)")
        .eq("id", itemId)
        .single();

      if (fetchErr) return err(fetchErr.message);
      return ok(updated);
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
