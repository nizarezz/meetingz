import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const svc = serviceClient();

    if (req.method === "GET") {
      const { data, error } = await caller.client
        .from("departments")
        .select("name")
        .order("name", { ascending: true });

      if (error) return err(error.message);
      return ok(data.map((d: { name: string }) => d.name));
    }

    if (req.method === "POST") {
      requireRole(caller, SUPER_ADMIN_ROLES);

      const body = await req.json().catch(() => ({}));
      const name = (body.name ?? "").trim();
      if (!name) return err("Department name is required", 400);

      const { error } = await svc
        .from("departments")
        .insert({ name })
        .single();

      if (error) {
        if (error.code === "23505") return err("Department already exists", 409);
        return err(error.message);
      }

      return ok({ name }, 201);
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "departments" });
    console.error("departments handler failed:", e);
    return err("Internal server error", 500);
  }
});
