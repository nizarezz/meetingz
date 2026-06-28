import { ok, err, preflight } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return err("Method not allowed", 405);

  try {
    const caller = await resolveCaller(req);

    const { data, error } = await caller.client
      .from("departments")
      .select("name")
      .order("name", { ascending: true });

    if (error) return err(error.message);
    return ok(data.map((d: { name: string }) => d.name));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
