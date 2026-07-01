import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createCommentSchema } from "../_shared/validate.ts";
import { captureException } from "../_shared/sentry.ts";
import { audit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/comments\/?/, "").split("/").filter(Boolean);
    const commentId = parts[0] ?? null;
    const meetingId = url.searchParams.get("meeting_id");
    const svc = serviceClient();

    if (req.method === "GET" && meetingId) {
      const page    = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from    = (page - 1) * perPage;
      const to      = from + perPage - 1;

      const { data, error, count } = await caller.client
        .from("comments")
        .select("id, meeting_id, user_id, text, created_at, users!comments_user_id_fkey(name, role)", { count: "exact" })
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

      const { data: existing } = await svc
        .from("comments")
        .select("id")
        .eq("meeting_id", meeting_id)
        .eq("user_id", caller.id)
        .maybeSingle();

      if (existing) return err("You can only add one comment per meeting", 409);

      const { data: comment, error: insertErr } = await svc
        .from("comments")
        .insert({
          meeting_id,
          user_id: caller.id,
          text: text.trim(),
          team_id: caller.team_id,
        })
        .select("id, meeting_id, user_id, text, created_at, users!comments_user_id_fkey(name, role)")
        .single();

      if (insertErr) return err(insertErr.message);
      return ok(comment, 201);
    }

    if (req.method === "DELETE" && commentId) {
      checkRateLimit(`comments:delete:${caller.team_id}`, 30, "comment deletions");

      const { data: existing } = await svc
        .from("comments")
        .select("id, meeting_id, user_id")
        .eq("id", commentId)
        .eq("team_id", caller.team_id)
        .single();

      if (!existing) return err("Comment not found", 404);

      const isAdmin = ADMIN_ROLES.includes(caller.role as any);

      if (!isAdmin) {
        const { data: meeting } = await caller.client
          .from("meetings")
          .select("created_by, facilitator_id")
          .eq("id", existing.meeting_id)
          .single();

        if (!meeting) return err("Meeting not found", 404);

        const isHost = meeting.facilitator_id === caller.id || meeting.created_by === caller.id;
        if (!isHost) {
          return err("Only admins or the meeting host can delete comments", 403);
        }
      }

      const { error: delErr } = await svc.from("comments").delete().eq("id", commentId);
      if (delErr) return err(delErr.message);

      await audit(caller.id, caller.team_id, "comment_delete", "comment", commentId, {
        meeting_id: existing.meeting_id,
        user_id: existing.user_id,
      });
      return ok({ deleted: true });
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
