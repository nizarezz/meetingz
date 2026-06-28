import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createMeetingSchema, updateMeetingSchema } from "../_shared/validate.ts";

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
        .select("id, title, status, scheduled_at, department, meeting_type")
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

        const { data: items } = await svc
          .from("agenda_items")
          .select("title, duration, assignee_email, presenter, notes")
          .eq("meeting_id", data.id)
          .order("sort_order", { ascending: true });

        return ok({
          ...base,
          agenda_items: items ?? [],
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
          scheduled_at, created_at,
          created_by, facilitator_id,
          share_token,
          meeting_participants (
            id, user_id, role, department,
            users ( id, name, email )
          ),
          agenda_items ( title, duration, assignee_email, presenter, notes )
        `, { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      query = query.order("sort_order", { foreignTable: "agenda_items", ascending: true });

      if (status)     query = query.eq("status", status);
      if (department) query = query.eq("department", department);

      query = query.range(from, to);
      const { data, error, count } = await query;
      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    if (req.method === "GET" && id) {
      const { data, error } = await userClient(req)
        .from("meetings")
        .select(`
          id, title, department, meeting_type, vibe,
          scheduled_duration, actual_duration, status,
          scheduled_at, created_at,
          created_by, facilitator_id, team_id,
          share_token, deleted_at, updated_at,
          meeting_participants (
            id, user_id, role, department, notified_at,
            users ( id, name, email, department )
          ),
          outcomes ( id, meeting_id, primary_outcome, notes, logged_by, team_id, created_at ),
          agenda_items ( title, duration, assignee_email, presenter, notes )
        `)
        .eq("id", id)
        .order("sort_order", { foreignTable: "agenda_items", ascending: true })
        .is("deleted_at", null)
        .single();

      if (error) return err(error.message, 404);
      return ok(data);
    }

    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`meetings:create:${caller.team_id}`, 30, "meeting creates");

      const body = await req.json().catch(() => ({}));
      const parsed = parse(createMeetingSchema, body);
      const {
        title, department, meeting_type, vibe,
        scheduled_duration, agenda_items,
        scheduled_at, facilitator_id, participants,
      } = parsed;

      const svc = serviceClient();

      const { data: meeting, error: meetingErr } = await svc
        .from("meetings")
        .insert({
          title,
          department,
          meeting_type,
          vibe,
          scheduled_duration,
          scheduled_at,
          facilitator_id,
          team_id:    caller.team_id,
          created_by: caller.id,
          status:     "planned",
        })
        .select()
        .single();

      if (meetingErr) return err(meetingErr.message);

      if (agenda_items.length > 0) {
        const rows = agenda_items.map((item: Record<string, unknown>, i: number) => ({
          meeting_id: meeting.id,
          sort_order: i,
          title: item.title,
          duration: item.duration ?? 0,
          assignee_email: item.assignee_email ?? null,
          presenter: item.presenter ?? null,
          notes: item.notes ?? null,
          team_id: caller.team_id,
        }));

        const { error: aiErr } = await svc
          .from("agenda_items")
          .insert(rows);

        if (aiErr) return err(aiErr.message);
      }

      const { data: items } = await svc
        .from("agenda_items")
        .select("title, duration, assignee_email, presenter, notes")
        .eq("meeting_id", meeting.id)
        .order("sort_order", { ascending: true });

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

      return ok({ ...meeting, agenda_items: items ?? [] }, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`meetings:update:${caller.team_id}`, 30, "meeting updates");
      const body = await req.json().catch(() => ({}));
      const parsed = parse(updateMeetingSchema, body);

      if (parsed.status) {
        const { data: current, error: fetchErr } = await userClient(req)
          .from("meetings")
          .select("status")
          .eq("id", id)
          .single();

        if (fetchErr || !current) return err("Meeting not found", 404);

        const allowed = TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(parsed.status)) {
          return err(
            `Cannot transition from '${current.status}' to '${parsed.status}'. ` +
            `Allowed next states: [${allowed.join(", ") || "none"}]`
          );
        }
      }

      const safe = Object.fromEntries(
        Object.entries(parsed).filter(
          ([k]) => !["timer_started_at","timer_base_total","timer_base_item",
                        "timer_item_started_at","is_timer_running","paused_at",
                        "agenda_items","team_id","created_by"].includes(k)
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

      if (parsed.agenda_items) {
        const svc = serviceClient();
        await svc.from("agenda_items").delete().eq("meeting_id", id);

        const rows = parsed.agenda_items.map((item, i) => ({
          meeting_id: id,
          sort_order: i,
          title: item.title,
          duration: item.duration,
          assignee_email: item.assignee_email ?? null,
          presenter: item.presenter ?? null,
          notes: item.notes ?? null,
          team_id: caller.team_id,
        }));

        const { error: aiErr } = await svc
          .from("agenda_items")
          .insert(rows);

        if (aiErr) return err(aiErr.message);
      }

      const { data: items } = await serviceClient()
        .from("agenda_items")
        .select("title, duration, assignee_email, presenter, notes")
        .eq("meeting_id", id)
        .order("sort_order", { ascending: true });

      if (parsed.status === "completed") {
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
            const jobs = (prefs ?? [])
              .map((pref) => {
                const user = participants.find((p: any) => p.user_id === pref.user_id)?.users as any;
                if (!user?.email) return null;
                return {
                  type: "send-email",
                  payload: {
                    to: user.email,
                    template: "outcome-prompt",
                    subject: `Outcome needed: ${data.title}`,
                    data: JSON.stringify({
                      name: user.name, title: data.title,
                      department: data.department, meetingType: data.meeting_type,
                      meetingUrl: `${baseUrl}/meetings/${id}`,
                    }),
                  },
                  status: "pending",
                };
              })
              .filter(Boolean);

            if (jobs.length > 0) {
              const { error: queueErr } = await serviceClient()
                .from("job_queue")
                .insert(jobs);
              if (queueErr) console.error("Failed to queue outcome prompt emails:", queueErr);
            }
          }
        } catch (e) {
          console.error("Outcome prompt error:", e);
        }
      }

      return ok({ ...data, agenda_items: items ?? [] });
    }

    if (req.method === "DELETE" && id) {
      requireRole(caller, SUPER_ADMIN_ROLES);
      checkRateLimit(`meetings:delete:${caller.team_id}`, 10, "meeting deletions");

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
