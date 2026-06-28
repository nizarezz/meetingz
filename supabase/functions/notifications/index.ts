import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/notifications\/?/, "").split("/").filter(Boolean);

    const svc = serviceClient();

    if (req.method === "GET" && parts[0] === "preferences") {
      const { data, error } = await caller.client
        .from("notification_preferences")
        .select("meeting_reminder_email, outcome_prompt_email")
        .eq("user_id", caller.id)
        .maybeSingle();

      if (error) return err(error.message);
      return ok(
        data ?? {
          meeting_reminder_email: true,
          outcome_prompt_email: true,
        }
      );
    }

    if (req.method === "PATCH" && parts[0] === "preferences") {
      checkRateLimit(`notifications:update:${caller.team_id}`, 30, "notification preference updates");
      const body = await req.json();
      const allowed = [
        "meeting_reminder_email",
        "outcome_prompt_email",
      ];
      const patch: Record<string, unknown> = {};

      for (const key of allowed) {
        if (typeof body[key] === "boolean") patch[key] = body[key];
      }

      if (Object.keys(patch).length === 0) return err("No valid preference fields to update");

      const { data, error } = await svc
        .from("notification_preferences")
        .upsert({ user_id: caller.id, ...patch }, { onConflict: "user_id" })
        .select("meeting_reminder_email, outcome_prompt_email")
        .single();

      if (error) return err(error.message);
      return ok(data);
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
