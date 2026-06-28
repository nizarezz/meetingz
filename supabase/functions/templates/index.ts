import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";

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

      let query = svc
        .from("templates")
        .select("id, name, description, department, meeting_type, agenda_items, created_by, created_at", { count: "exact" })
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (department)  query = query.eq("department", department);
      if (meetingType) query = query.eq("meeting_type", meetingType);

      query = query.range(from, to);
      const { data, error, count } = await query;
      if (error) return err(error.message);
      const total = count ?? 0;
      return ok({ data, page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) });
    }

    if (req.method === "GET" && id) {
      const { data, error } = await svc
        .from("templates")
        .select("id, name, description, department, meeting_type, agenda_items, created_by, team_id, created_at, deleted_at")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (error || !data) return err("Template not found", 404);
      return ok(data);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);

      const body = await req.json();
      const { name, description, department, meeting_type, agenda_items = [] } = body;

      if (!name || !department || !meeting_type) {
        return err("name, department, and meeting_type are required");
      }

      const { data, error } = await svc
        .from("templates")
        .insert({
          name,
          description: description ?? null,
          department,
          meeting_type,
          agenda_items,
          team_id:    caller.team_id,
          created_by: caller.id,
        })
        .select()
        .single();

      if (error) return err(error.message);
      return ok(data, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      const body = await req.json();
      const allowed = ["name", "description", "department", "meeting_type", "agenda_items"];
      const patch: Record<string, unknown> = {};

      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      if (Object.keys(patch).length === 0) return err("No valid fields to update");

      const { data, error } = await svc
        .from("templates")
        .update(patch)
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .select()
        .single();

      if (error) return err(error.message, 404);
      return ok(data);
    }

    if (req.method === "DELETE" && id) {
      requireRole(caller, SUPER_ADMIN_ROLES);

      const { error } = await svc
        .from("templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (error) return err(error.message);
      return ok({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
