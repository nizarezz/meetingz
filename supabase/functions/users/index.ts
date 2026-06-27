import { ok, err, preflight } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/users\/?/, "").split("/").filter(Boolean);
    const id     = parts[0] ?? null;
    const action = parts[1] ?? null;

    const svc = serviceClient();

    if (req.method === "GET" && !id) {
      const department = url.searchParams.get("department");
      const role       = url.searchParams.get("role");
      const hasPage    = url.searchParams.has("page") || url.searchParams.has("per_page");
      const page       = parseInt(url.searchParams.get("page") ?? "1", 10);
      const perPage    = parseInt(url.searchParams.get("per_page") ?? "1000", 10);
      const from       = (page - 1) * perPage;
      const to         = from + perPage - 1;

      let query = svc
        .from("users")
        .select("id, email, name, role, department, is_approved, created_at", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (caller.team_id) query = query.eq("team_id", caller.team_id);
      if (department) query = query.eq("department", department);
      if (role)       query = query.eq("role", role);

      const queryFn = hasPage ? query.range(from, to) : query;
      const { data, error, count } = await queryFn;
      if (error) return err(error.message);
      return ok({ data, total: count ?? 0, page, per_page: perPage });
    }

    if (req.method === "GET" && id) {
      const { data, error } = await svc
        .from("users")
        .select("id, email, name, role, department, is_approved, fcm_token, created_at")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      if (error || !data) return err("User not found", 404);
      return ok(data);
    }

    if (req.method === "PATCH" && id && !action) {
      if (caller.id !== id) return err("You can only update your own profile", 403);

      const body = await req.json();
      const allowed = ["name", "department", "fcm_token"];
      const patch: Record<string, unknown> = {};

      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      if (Object.keys(patch).length === 0) return err("No valid fields to update");

      const { data, error } = await svc
        .from("users")
        .update(patch)
        .eq("id", id)
        .select("id, email, name, role, department, is_approved")
        .single();

      if (error) return err(error.message);
      return ok(data);
    }

    if (req.method === "PATCH" && id && action === "approve") {
      requireRole(caller, ADMIN_ROLES);

      const { data, error } = await svc
        .from("users")
        .update({ is_approved: true })
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .select("id, email, name, role, department, is_approved")
        .single();

      if (error) return err(error.message, 404);
      return ok(data);
    }

    if (req.method === "PATCH" && id && action === "deactivate") {
      requireRole(caller, SUPER_ADMIN_ROLES);

      const { error } = await svc
        .from("users")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (error) return err(error.message);
      return ok({ deactivated: true });
    }

    if (req.method === "POST" && action === "invite") {
      requireRole(caller, ADMIN_ROLES);

      const body = await req.json();
      const { email, name, department, role = "member" } = body;

      if (!email || !name) return err("email and name are required");

      const { data: existing } = await svc
        .from("users")
        .select("id, deleted_at")
        .eq("email", email)
        .maybeSingle();

      if (existing && !existing.deleted_at) {
        return err("A user with this email already exists in your team");
      }

      if (existing?.deleted_at) {
        const { data, error } = await svc
          .from("users")
          .update({
            name,
            department: department ?? null,
            role,
            is_approved: false,
            deleted_at: null,
          })
          .eq("id", existing.id)
          .select("id, email, name, role, department, is_approved")
          .single();

        if (error) return err(error.message);
        return ok(data);
      }

      return err("User must first sign up via Supabase Auth before being invited to a team", 400);
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
