import { ok, err, preflight } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { sendNotificationEmail } from "../_shared/resend.ts";

const TRANSITIONS: Record<string, string[]> = {
  planned:   ["active"],
  active:    ["completed"],
  completed: ["logged"],
  logged:    [],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/meetings\/?/, "").split("/").filter(Boolean);
    const id     = parts[0] ?? null;

    // --- Public share endpoint (no JWT required) ---
    if (req.method === "GET" && parts[0] === "public" && parts[1]) {
      const svc = serviceClient();
      const { data, error } = await svc
        .from("meetings")
        .select("id, title, status, scheduled_at, department, meeting_type, agenda_items")
        .eq("share_token", parts[1])
        .is("deleted_at", null)
        .single();

      if (error || !data) return err("Meeting not found", 404);

      const now = new Date();
      const scheduled = data.scheduled_at ? new Date(data.scheduled_at) : null;

      let state: string;
      if (data.status === "active") {
        state = "active";
      } else if (data.status === "planned") {
        const fiveMinBefore = scheduled ? new Date(scheduled.getTime() - 5 * 60 * 1000) : null;
        state = fiveMinBefore && now >= fiveMinBefore ? "starting_soon" : "upcoming";
      } else {
        state = "ended";
      }

      const base = { id: data.id, title: data.title, state, scheduled_at: data.scheduled_at, department: data.department, meeting_type: data.meeting_type };

      if (state === "active" || state === "starting_soon") {
        const { data: timer } = await svc
          .from("meeting_timer_state")
          .select("*")
          .eq("meeting_id", data.id)
          .maybeSingle();

        return ok({
          ...base,
          agenda_items: data.agenda_items,
          active_item_index: timer?.active_item_index ?? 0,
          is_timer_running: timer?.is_timer_running ?? false,
          timer_started_at: timer?.timer_started_at ?? null,
          timer_item_started_at: timer?.timer_item_started_at ?? null,
          timer_base_total: timer?.timer_base_total ?? 0,
          timer_base_item: timer?.timer_base_item ?? 0,
          paused_at: timer?.paused_at ?? null,
        });
      }

      return ok(base);
    }

    const caller = await resolveCaller(req);

    if (req.method === "GET" && !id) {
      const status     = url.searchParams.get("status");
      const department = url.searchParams.get("department");
      const page       = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage    = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from       = (page - 1) * perPage;
      const to         = from + perPage - 1;

      const client = userClient(req);
      let query = client
        .from("meetings")
        .select(`
          id, title, department, meeting_type, vibe,
          scheduled_duration, actual_duration, status,
          agenda_items, scheduled_at, created_at,
          created_by, facilitator_id,
          share_token,
          meeting_participants (
            id, user_id, role, department,
            users ( id, name, email )
          )
        `, { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (status)     query = query.eq("status", status);
      if (department) query = query.eq("department", department);

      query = query.range(from, to);
      const { data, error, count } = await query;
      if (error) return err(error.message);
      const total = count ?? 0;
      return ok({ data, page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) });
    }

    if (req.method === "GET" && id) {
      const { data, error } = await userClient(req)
        .from("meetings")
        .select(`
          id, title, department, meeting_type, vibe,
          scheduled_duration, actual_duration, status,
          agenda_items, scheduled_at, created_at,
          created_by, facilitator_id, team_id,
          share_token, deleted_at, updated_at,
          meeting_participants (
            id, user_id, role, department, notified_at,
            users ( id, name, email, department )
          ),
          outcomes ( id, meeting_id, primary_outcome, notes, logged_by, team_id, created_at )
        `)
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      if (error) return err(error.message, 404);
      return ok(data);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);

      const body = await req.json();
      const {
        title, department, meeting_type, vibe,
        scheduled_duration, agenda_items = [],
        scheduled_at, facilitator_id, participants = [],
      } = body;

      if (!title || !department || !meeting_type || !scheduled_duration) {
        return err("title, department, meeting_type, and scheduled_duration are required");
      }

      const svc = serviceClient();

      const { data: meeting, error: meetingErr } = await svc
        .from("meetings")
        .insert({
          title,
          department,
          meeting_type,
          vibe,
          scheduled_duration,
          agenda_items,
          scheduled_at,
          facilitator_id,
          team_id:    caller.team_id,
          created_by: caller.id,
          status:     "planned",
        })
        .select()
        .single();

      if (meetingErr) return err(meetingErr.message);

      if (participants.length > 0) {
        const rows = participants.map(
          (p: { user_id: string; role: string; department?: string }) => ({
            meeting_id: meeting.id,
            user_id:    p.user_id,
            role:       p.role,
            department: p.department ?? null,
            team_id:    caller.team_id,
          })
        );

        const { error: pErr } = await svc
          .from("meeting_participants")
          .insert(rows);

        if (pErr) return err(pErr.message);
      }

      return ok(meeting, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      const body = await req.json();

      if (body.status) {
        const { data: current, error: fetchErr } = await userClient(req)
          .from("meetings")
          .select("status")
          .eq("id", id)
          .single();

        if (fetchErr || !current) return err("Meeting not found", 404);

        const allowed = TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(body.status)) {
          return err(
            `Cannot transition from '${current.status}' to '${body.status}'. ` +
            `Allowed next states: [${allowed.join(", ") || "none"}]`
          );
        }
      }

      const safe = Object.fromEntries(
        Object.entries(body).filter(
          ([k]) => !["timer_started_at","timer_base_total","timer_base_item",
                        "timer_item_started_at","is_timer_running","paused_at",
                        "team_id","created_by"].includes(k)
        )
      );

      const { data, error } = await userClient(req)
        .from("meetings")
        .update(safe)
        .eq("id", id)
        .is("deleted_at", null)
        .select()
        .single();

      if (error) return err(error.message);

      if (body.status === "completed") {
        try {
          const { data: participants } = await userClient(req)
            .from("meeting_participants")
            .select("user_id, users!inner(id, email, name)")
            .eq("meeting_id", id);

          if (participants?.length) {
            const userIds = participants.map((p: any) => p.user_id);
            const { data: prefs } = await serviceClient()
              .from("notification_preferences")
              .select("user_id")
              .in("user_id", userIds)
              .eq("outcome_prompt_email", true);

            const baseUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
            for (const pref of prefs ?? []) {
              const user = participants.find((p: any) => p.user_id === pref.user_id)?.users as any;
              if (!user?.email) continue;
              try {
                await sendNotificationEmail(
                  user.email, "outcome-prompt",
                  `Outcome needed: ${data.title}`,
                  {
                    name: user.name, title: data.title,
                    department: data.department, meetingType: data.meeting_type,
                    meetingUrl: `${baseUrl}/meetings/${id}`,
                  }
                );
              } catch (e) {
                console.error(`Failed to send outcome prompt to ${user.email}:`, e);
              }
            }
          }
        } catch (e) {
          console.error("Outcome prompt error:", e);
        }
      }

      return ok(data);
    }

    if (req.method === "DELETE" && id) {
      requireRole(caller, SUPER_ADMIN_ROLES);

      const { error } = await serviceClient()
        .from("meetings")
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
