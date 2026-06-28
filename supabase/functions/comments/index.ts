import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const meetingId = url.searchParams.get("meeting_id");
    const svc = serviceClient();

    if (req.method === "GET" && meetingId) {
      const { data, error } = await svc
        .from("comments")
        .select("id, meeting_id, user_id, text, created_at, users!inner(name, role)")
        .eq("meeting_id", meetingId)
        .eq("team_id", caller.team_id)
        .order("created_at", { ascending: true });

      if (error) return err(error.message);
      return ok(data ?? []);
    }

    if (req.method === "POST") {
      checkRateLimit(`comments:create:${caller.team_id}`, 60, "comments");
      const body = await req.json();
      const { meeting_id, text } = body;

      if (!meeting_id || !text?.trim()) return err("meeting_id and text are required");

      const { data: meeting, error: meetingErr } = await svc
        .from("meetings")
        .select("id")
        .eq("id", meeting_id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (meetingErr || !meeting) return err("Meeting not found", 404);

      const { data: comment, error: insertErr } = await svc
        .from("comments")
        .insert({
          meeting_id,
          user_id: caller.id,
          text: text.trim(),
          team_id: caller.team_id,
        })
        .select("id, meeting_id, user_id, text, created_at, users!inner(name, role)")
        .single();

      if (insertErr) return err(insertErr.message);
      return ok(comment, 201);
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
