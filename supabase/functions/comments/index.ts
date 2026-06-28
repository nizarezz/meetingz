import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createCommentSchema } from "../_shared/validate.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const meetingId = url.searchParams.get("meeting_id");
    const svc = serviceClient();

    if (req.method === "GET" && meetingId) {
      const page    = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from    = (page - 1) * perPage;
      const to      = from + perPage - 1;

      const { data, error, count } = await caller.client
        .from("comments")
        .select("id, meeting_id, user_id, text, created_at, users!inner(name, role)", { count: "exact" })
        .eq("meeting_id", meetingId)
        .eq("team_id", caller.team_id)
        .order("created_at", { ascending: true })
        .range(from, to);

      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    if (req.method === "POST") {
      checkRateLimit(`comments:create:${caller.team_id}`, 60, "comments");
      const body = await req.json().catch(() => ({}));
      const parsed = parse(createCommentSchema, body);
      const { meeting_id, text } = parsed;

      if (!meeting_id || !text?.trim()) return err("meeting_id and text are required");

      const { data: meeting, error: meetingErr } = await caller.client
        .from("meetings")
        .select("id")
        .eq("id", meeting_id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (meetingErr || !meeting) return err("Meeting not found", 404);

      const { data: participant } = await caller.client
        .from("meeting_participants")
        .select("id")
        .eq("meeting_id", meeting_id)
        .eq("user_id", caller.id)
        .maybeSingle();
      if (!participant) return err("Only meeting participants can comment", 403);

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
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "comments" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
