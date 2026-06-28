import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createTemplateSchema } from "../_shared/validate.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/templates\/?/, "").split("/").filter(Boolean);
    const id     = parts[0] ?? null;

    const svc = serviceClient();

    if (req.method === "GET" && !id) {
      const department  = url.searchParams.get("department");
      const meetingType = url.searchParams.get("meeting_type");
      const page        = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage     = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from        = (page - 1) * perPage;
      const to          = from + perPage - 1;

      let query = caller.client
        .from("templates")
        .select(`
          id, name, description, department, meeting_type, created_by, created_at,
          agenda_items ( title, duration, assignee_email, presenter, notes )
        `, { count: "exact" })
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (department)  query = query.eq("department", department);
      if (meetingType) query = query.eq("meeting_type", meetingType);

      query = query.range(from, to).order("sort_order", { foreignTable: "agenda_items", ascending: true });
      const { data, error, count } = await query;
      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    if (req.method === "GET" && id) {
      const { data, error } = await caller.client
        .from("templates")
        .select(`
          id, name, description, department, meeting_type, created_by, team_id, created_at, deleted_at,
          agenda_items ( title, duration, assignee_email, presenter, notes )
        `)
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .order("sort_order", { foreignTable: "agenda_items", ascending: true })
        .single();

      if (error || !data) return err("Template not found", 404);
      return ok(data);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`templates:create:${caller.team_id}`, 30, "template creates");

      const body = await req.json().catch(() => ({}));
      const parsed = parse(createTemplateSchema, body);
      const { name, description, department, meeting_type, agenda_items } = parsed;

      const { data, error } = await svc
        .from("templates")
        .insert({
          name,
          description: description ?? null,
          department,
          meeting_type,
          team_id:    caller.team_id,
          created_by: caller.id,
        })
        .select()
        .single();

      if (error) return err(error.message);

      if (agenda_items.length > 0) {
        const rows = agenda_items.map((item: Record<string, unknown>, i: number) => ({
          template_id: data.id,
          sort_order: i,
          title: item.title,
          duration: item.duration ?? 0,
          assignee_email: item.assignee_email ?? null,
          presenter: item.presenter ?? null,
          notes: item.notes ?? null,
          team_id: caller.team_id,
        }));

        const { error: aiErr } = await svc
          .from("agenda_items")
          .insert(rows);

        if (aiErr) return err(aiErr.message);
      }

      const { data: items } = await caller.client
        .from("agenda_items")
        .select("title, duration, assignee_email, presenter, notes")
        .eq("template_id", data.id)
        .order("sort_order", { ascending: true });

      await audit(caller.id, caller.team_id, "template_create", "template", data.id, { name: data.name });
      return ok({ ...data, agenda_items: items ?? [] }, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`templates:update:${caller.team_id}`, 30, "template updates");
      const body = await req.json();
      const allowed = ["name", "description", "department", "meeting_type"];
      const patch: Record<string, unknown> = {};

      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      if (Object.keys(patch).length === 0 && body.agenda_items === undefined) {
        return err("No valid fields to update");
      }

      if (Object.keys(patch).length > 0) {
        const { error: updateErr } = await svc
          .from("templates")
          .update(patch)
          .eq("id", id)
          .eq("team_id", caller.team_id)
          .is("deleted_at", null)
          .select()
          .single();

        if (updateErr) return err(updateErr.message, 404);
      }

      if (body.agenda_items) {
        await svc.from("agenda_items").delete().eq("template_id", id);

        const rows = body.agenda_items.map((item: Record<string, unknown>, i: number) => ({
          template_id: id,
          sort_order: i,
          title: item.title,
          duration: item.duration ?? 0,
          assignee_email: item.assignee_email ?? null,
          presenter: item.presenter ?? null,
          notes: item.notes ?? null,
          team_id: caller.team_id,
        }));

        const { error: aiErr } = await svc
          .from("agenda_items")
          .insert(rows);

        if (aiErr) return err(aiErr.message);
      }

      const { data: updated } = await caller.client
        .from("templates")
        .select(`
          id, name, description, department, meeting_type, created_by, team_id, created_at, deleted_at,
          agenda_items ( title, duration, assignee_email, presenter, notes )
        `)
        .eq("id", id)
        .order("sort_order", { foreignTable: "agenda_items", ascending: true })
        .single();

      return ok(updated);
    }

    if (req.method === "DELETE" && id) {
      requireRole(caller, SUPER_ADMIN_ROLES);
      checkRateLimit(`templates:delete:${caller.team_id}`, 10, "template deletions");

      const { error } = await svc
        .from("templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (error) return err(error.message);
      await audit(caller.id, caller.team_id, "template_delete", "template", id, {});
      return ok({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "templates" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
