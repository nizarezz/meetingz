import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

const VALID_ROLES = ["organizer", "presenter", "attendee"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/participants\/?/, "").split("/").filter(Boolean);
    const id     = parts[0] ?? null;

    const svc = serviceClient();

    if (req.method === "GET") {
      const meetingId = url.searchParams.get("meeting_id");
      if (!meetingId) return err("meeting_id query param is required");

      const page    = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from    = (page - 1) * perPage;
      const to      = from + perPage - 1;

      const { data, error, count } = await caller.client
        .from("meeting_participants")
        .select(`
          id, meeting_id, user_id, role, created_at,
          users ( id, name, email, department )
        `, { count: "exact" })
        .eq("meeting_id", meetingId)
        .eq("team_id", caller.team_id)
        .order("created_at", { ascending: true })
        .range(from, to);

      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`participants:create:${caller.team_id}`, 30, "participant adds");

      const body = await req.json();
      const { meeting_id, user_id, role = "attendee" } = body;

      if (!meeting_id || !user_id) return err("meeting_id and user_id are required");
      if (!VALID_ROLES.includes(role)) {
        return err(`role must be one of: ${VALID_ROLES.join(", ")}`);
      }

      const { data: meeting, error: meetingErr } = await caller.client
        .from("meetings")
        .select("id")
        .eq("id", meeting_id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (meetingErr || !meeting) return err("Meeting not found", 404);

      const { data: user, error: userErr } = await caller.client
        .from("users")
        .select("id")
        .eq("id", user_id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (userErr || !user) return err("User not found in your team", 404);

      const { data, error } = await svc
        .from("meeting_participants")
        .insert({
          meeting_id,
          user_id,
          role,
          team_id:    caller.team_id,
        })
        .select(`
          id, user_id, role,
          users ( id, name, email )
        `)
        .single();

      if (error) {
        if (error.code === "23505") return err("User is already a participant");
        return err(error.message);
      }

      await audit(caller.id, caller.team_id, "participant_add", "participant", data.id, { meeting_id, user_id });
      return ok(data, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`participants:update:${caller.team_id}`, 30, "participant updates");

      const body = await req.json();
      if (!body.role) return err("role is required");
      if (!VALID_ROLES.includes(body.role)) {
        return err(`role must be one of: ${VALID_ROLES.join(", ")}`);
      }

      const { data, error } = await svc
        .from("meeting_participants")
        .update({ role: body.role })
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .select(`
          id, user_id, role,
          users ( id, name, email )
        `)
        .single();

      if (error) return err(error.message, 404);
      return ok(data);
    }

    if (req.method === "DELETE" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`participants:delete:${caller.team_id}`, 30, "participant removals");

      const { error } = await svc
        .from("meeting_participants")
        .delete()
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (error) return err(error.message);
      await audit(caller.id, caller.team_id, "participant_remove", "participant", id, {});
      return ok({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "participants" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
