import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { parse, createMeetingSchema, updateMeetingSchema } from "../_shared/validate.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

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

      const client = caller.client;
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
      const { data, error } = await caller.client
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

      const { data: items } = await caller.client
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

      await audit(caller.id, caller.team_id, "meeting_create", "meeting", meeting.id, { title: meeting.title });
      return ok({ ...meeting, agenda_items: items ?? [] }, 201);
    }

    if (req.method === "PATCH" && id) {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`meetings:update:${caller.team_id}`, 30, "meeting updates");

      const { data: meetingOwner } = await caller.client
        .from("meetings")
        .select("created_by")
        .eq("id", id)
        .single();
      if (!meetingOwner) return err("Meeting not found", 404);
      const adminRoles = [...ADMIN_ROLES, ...SUPER_ADMIN_ROLES];
      const isAdmin = adminRoles.includes(caller.role as any);
      if (!isAdmin && meetingOwner.created_by !== caller.id) {
        return err("Forbidden", 403);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = parse(updateMeetingSchema, body);

      if (parsed.status) {
        const { data: current, error: fetchErr } = await caller.client
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

      // --- Log action: freeze meeting, build snapshot, queue digest emails ---
      if (parsed.status === "logged") {
        const svc = serviceClient();

        const [outcomesRes, notesRes, actionItemsRes, commentsRes] = await Promise.all([
          svc.from("outcomes").select("id, primary_outcome, notes, created_at").eq("meeting_id", id),
          svc.from("outcome_notes").select("text, sort_order, source, created_at, created_by_user:users!created_by(name)").eq("meeting_id", id).order("sort_order", { ascending: true }),
          svc.from("action_items").select("id, text, status, priority, assignee_id, assignee_email, due_date, created_at, meetings!inner(title)").eq("meeting_id", id),
          svc.from("comments").select("id, user_id, text, created_at, users!comments_user_id_fkey(name), pulled_to_outcome").eq("meeting_id", id).order("created_at", { ascending: true }),
        ]);

        const report_snapshot = {
          outcomes: outcomesRes.data ?? [],
          notes: notesRes.data ?? [],
          action_items: (actionItemsRes.data ?? []).map((ai: Record<string, unknown>) => {
            const { meetings, ...rest } = ai as { meetings: { title: string }; [key: string]: unknown };
            return rest;
          }),
          pulled_comments: (commentsRes.data ?? []).filter((c: { pulled_to_outcome?: boolean }) => c.pulled_to_outcome),
          comment_thread: (commentsRes.data ?? []).map((c: { pulled_to_outcome?: boolean; users?: { name: string }; [key: string]: unknown }) => {
            const { pulled_to_outcome, ...rest } = c;
            return rest;
          }),
          logged_at: new Date().toISOString(),
          logged_by: caller.id,
        };

        const { data: loggedMeeting, error: logErr } = await svc
          .from("meetings")
          .update({
            status: "logged",
            logged_at: new Date().toISOString(),
            logged_by: caller.id,
            report_snapshot,
          })
          .eq("id", id)
          .is("deleted_at", null)
          .select()
          .single();

        if (logErr) return err(logErr.message);

        await audit(caller.id, caller.team_id, "meeting_log", "meeting", id, {
          title: loggedMeeting.title,
        });

        // Queue assignment digest emails — one per unique assignee
        try {
          const assignees = new Map<string, { email: string; name: string }>();
          for (const ai of (actionItemsRes.data ?? []) as Array<{ assignee_email?: string; assignee_id?: string; text: string }>) {
            let email = ai.assignee_email;
            let name = email ?? "Assignee";
            if (ai.assignee_id && !email) {
              const { data: u } = await svc.from("users").select("email, name").eq("id", ai.assignee_id).single();
              if (u) { email = u.email; name = u.name; }
            }
            if (email && !assignees.has(email)) {
              assignees.set(email, { email, name });
            }
          }

          const baseUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
          const digestJobs = Array.from(assignees.values()).map((a) => ({
            type: "send-email",
            payload: {
              to: a.email,
              template: "assignment-digest",
              subject: `Assignment summary: ${loggedMeeting.title}`,
              data: JSON.stringify({
                name: a.name,
                title: loggedMeeting.title,
                meetingUrl: `${baseUrl}/meetings/${id}`,
              }),
            },
            status: "pending",
          }));

          if (digestJobs.length > 0) {
            const { error: queueErr } = await svc.from("job_queue").insert(digestJobs);
            if (queueErr) console.error("Failed to queue assignment digest emails:", queueErr.message);
          }
        } catch (e) {
          console.error("Assignment digest queue error:", e);
        }

        const { data: agendaItems } = await caller.client
          .from("agenda_items")
          .select("title, duration, assignee_email, presenter, notes")
          .eq("meeting_id", id)
          .order("sort_order", { ascending: true });

        return ok({ ...loggedMeeting, agenda_items: agendaItems ?? [] });
      }

      const safe = Object.fromEntries(
        Object.entries(parsed).filter(
          ([k]) => !["timer_started_at","timer_base_total","timer_base_item",
                        "timer_item_started_at","is_timer_running","paused_at",
                        "agenda_items","team_id","created_by"].includes(k)
        )
      );

      const { data, error } = await caller.client
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

      const { data: items } = await caller.client
        .from("agenda_items")
        .select("title, duration, assignee_email, presenter, notes")
        .eq("meeting_id", id)
        .order("sort_order", { ascending: true });

      if (parsed.status === "completed") {
        await audit(caller.id, caller.team_id, "meeting_complete", "meeting", id, { title: data.title });
        try {
          const { data: participants } = await caller.client
            .from("meeting_participants")
            .select("user_id, users!inner(id, email, name)")
            .eq("meeting_id", id);

          if (participants?.length) {
            const userIds = participants.map((p: any) => p.user_id);
            const { data: prefs } = await caller.client
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
          const msg = e instanceof Error ? e.message : "Unknown error";
          await captureException(msg, { context: "meetings-outcome-prompt" });
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
      await audit(caller.id, caller.team_id, "meeting_delete", "meeting", id, {});
      return ok({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "meetings" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
