import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const svc    = serviceClient();

    if (req.method === "GET") {
      if (!caller.team_id) return ok(null);
      const { data, error } = await svc
        .from("teams")
        .select("id, name, created_at")
        .eq("id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (error || !data) return ok(null);
      return ok(data);
    }

    if (req.method === "PATCH") {
      requireRole(caller, SUPER_ADMIN_ROLES);
      checkRateLimit(`teams:update:${caller.team_id}`, 10, "team updates");

      const body = await req.json();
      if (!body.name) return err("name is required");

      const { data, error } = await svc
        .from("teams")
        .update({ name: body.name })
        .eq("id", caller.team_id)
        .select("id, name, created_at")
        .single();

      if (error) return err(error.message);
      return ok(data);
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
