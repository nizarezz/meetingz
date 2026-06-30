import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, requireDeptAccess, requireMeetingOpen, ADMIN_ROLES } from "../_shared/auth.ts";
import { parse, createActionItemSchema, updateActionItemSchema } from "../_shared/validate.ts";
import { audit } from "../_shared/audit.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const url = new URL(req.url);
    const id = url.pathname.replace(/^\/action-items\/?/, "").split("/")[0] || null;
    const action = url.searchParams.get("action");
    const caller = await resolveCaller(req);
    const svc = serviceClient();
    const isAdmin = caller.role === "super_admin" || caller.role === "dept_admin";

    // --- LIST ---
    if (req.method === "GET" && !id) {
      const assigneeId = url.searchParams.get("assignee_id");
      const assigneeEmail = url.searchParams.get("assignee_email");
      const assignedBy = url.searchParams.get("assigned_by");
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;

      let query = svc
        .from("action_items")
        .select("*, meetings!inner(title, scheduled_at, status), assignee:users!assignee_id(name, email)", { count: "exact" })
        .eq("team_id", caller.team_id)
        .is("meetings.deleted_at", null);

      if (isAdmin) {
        if (assigneeId) query = query.eq("assignee_id", assigneeId);
        if (assigneeEmail) query = query.eq("assignee_email", assigneeEmail);
        if (assignedBy) query = query.eq("assigned_by", assignedBy);
      } else {
        query = query.or(`assignee_id.eq.${caller.id},assigned_by.eq.${caller.id}`);
        if (assigneeId && assigneeId === caller.id) query = query.eq("assignee_id", assigneeId);
        if (assigneeEmail) query = query.eq("assignee_email", assigneeEmail);
        if (assignedBy && assignedBy === caller.id) query = query.eq("assigned_by", assignedBy);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    // --- GET single ---
    if (req.method === "GET" && id) {
      let query = svc
        .from("action_items")
        .select("*, meetings!inner(title, scheduled_at, status), assignee:users!assignee_id(name, email)")
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (!isAdmin) {
        query = query.or(`assignee_id.eq.${caller.id},assigned_by.eq.${caller.id}`);
      }

      const { data, error } = await query.single();

      if (error || !data) return err("Not found", 404);
      return ok(data);
    }

    // --- POST (create) ---
    if (req.method === "POST") {
      requireRole(caller, ADMIN_ROLES);

      const body = await req.json().catch(() => ({}));
      const parsed = parse(createActionItemSchema, body);

      await requireMeetingOpen(parsed.meeting_id, svc);

      let assigneeId = parsed.assignee_id ?? null;
      let crossDept = false;

      if (assigneeId) {
        const result = await requireDeptAccess(caller, assigneeId, svc);
        crossDept = result.crossDept;
      } else if (parsed.assignee_email) {
        crossDept = true;
        const { data: matchedUser } = await svc
          .from("users")
          .select("id")
          .eq("email", parsed.assignee_email)
          .is("deleted_at", null)
          .maybeSingle();

        if (matchedUser) {
          assigneeId = matchedUser.id;
          const result = await requireDeptAccess(caller, matchedUser.id, svc);
          crossDept = result.crossDept;
        }
      }

      const { data: item, error: insertErr } = await svc
        .from("action_items")
        .insert({
          meeting_id: parsed.meeting_id,
          text: parsed.text,
          assignee_id: assigneeId,
          assignee_email: parsed.assignee_email ?? null,
          due_date: parsed.due_date ?? null,
          priority: parsed.priority ?? "medium",
          status: "pending",
          assigned_by: caller.id,
          team_id: caller.team_id,
        })
        .select()
        .single();

      if (insertErr) return err(insertErr.message);

      let warn = crossDept;

      if (crossDept && assigneeId) {
        const { data: assignee } = await svc
          .from("users")
          .select("department")
          .eq("id", assigneeId)
          .single();

        const dept = assignee?.department;
        const { data: deptAdmins } = await svc
          .from("users")
          .select("id")
          .eq("team_id", caller.team_id)
          .eq("department", dept)
          .in("role", ["dept_admin", "super_admin"])
          .neq("id", caller.id);

        if (deptAdmins?.length) {
          await svc.from("notifications").insert(
            deptAdmins.map((admin: { id: string }) => ({
              user_id: admin.id,
              type: "cross_dept_assignment",
              title: "Cross-department assignment",
              body: `A task was assigned to your department from outside`,
              data: { action_item_id: item.id, meeting_id: parsed.meeting_id, assigned_by: caller.id },
            }))
          );
        }
      } else if (crossDept && !assigneeId) {
        const { data: superAdmins } = await svc
          .from("users")
          .select("id")
          .eq("team_id", caller.team_id)
          .eq("role", "super_admin")
          .neq("id", caller.id);

        if (superAdmins?.length) {
          await svc.from("notifications").insert(
            superAdmins.map((admin: { id: string }) => ({
              user_id: admin.id,
              type: "cross_dept_assignment",
              title: "Unregistered user assigned",
              body: `A task was assigned to ${parsed.assignee_email} who is not registered`,
              data: { action_item_id: item.id, meeting_id: parsed.meeting_id, assigned_by: caller.id },
            }))
          );
        }
      }

      await audit(caller.id, caller.team_id, "action_item_create", "action_item", item.id, {
        meeting_id: parsed.meeting_id,
        text: parsed.text,
        assignee_id: assigneeId,
        cross_dept: crossDept,
      });

      return ok({ data: item, warn }, 201);
    }

    // --- PATCH (update) ---
    if (req.method === "PATCH" && id) {
      const { data: existing, error: fetchErr } = await svc
        .from("action_items")
        .select("*, meetings!inner(title, status, created_by)")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .single();

      if (fetchErr || !existing) return err("Not found", 404);

      if (action === "done") {
        if (existing.assignee_id !== caller.id) {
          return err("Only the assignee can mark this as done", 403);
        }
        if (existing.status === "done" || existing.status === "blocked") {
          return err(`Cannot mark a ${existing.status} item as done`, 409);
        }

        const { error: updateErr } = await svc
          .from("action_items")
          .update({ status: "done", done: true })
          .eq("id", id);

        if (updateErr) return err(updateErr.message);

        const { data: creator } = await svc
          .from("users")
          .select("id")
          .eq("id", existing.assigned_by)
          .maybeSingle();

        const notifyIds: string[] = [];
        if (creator && creator.id !== caller.id) notifyIds.push(creator.id);

        const { data: deptAdmin } = await svc
          .from("users")
          .select("id")
          .eq("team_id", caller.team_id)
          .eq("role", "dept_admin")
          .eq("department", caller.department)
          .neq("id", caller.id)
          .maybeSingle();

        if (deptAdmin && !notifyIds.includes(deptAdmin.id)) notifyIds.push(deptAdmin.id);

        if (notifyIds.length > 0) {
          await svc.from("notifications").insert(
            notifyIds.map((uid) => ({
              user_id: uid,
              type: "assignment_done",
              title: "Assignment completed",
              body: `"${existing.text}" was marked done`,
              data: { action_item_id: id, meeting_id: existing.meeting_id, done_by: caller.id },
            }))
          );
        }

        await audit(caller.id, caller.team_id, "action_item_done", "action_item", id, {
          text: existing.text,
        });

        const { data: updated } = await svc
          .from("action_items")
          .select("*, meetings!inner(title, scheduled_at, status), assignee:users!assignee_id(name, email)")
          .eq("id", id)
          .single();

        return ok(updated);
      }

      if (action === "block") {
        requireRole(caller, ADMIN_ROLES);

        if (caller.role !== "super_admin" && existing.assignee_id) {
          const { data: assignee } = await svc
            .from("users")
            .select("department")
            .eq("id", existing.assignee_id)
            .single();

          if (!assignee || assignee.department !== caller.department) {
            return err("Cannot block assignments outside your department", 403);
          }
        }

        if (existing.status === "blocked" || existing.status === "done") {
          return err(`Cannot block a ${existing.status} item`, 409);
        }

        const { error: updateErr } = await svc
          .from("action_items")
          .update({
            status: "blocked",
            blocked_by: caller.id,
            blocked_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateErr) return err(updateErr.message);

        const notifyIds: string[] = [existing.assigned_by].filter(Boolean);
        if (existing.assignee_id && !notifyIds.includes(existing.assignee_id)) {
          notifyIds.push(existing.assignee_id);
        }

        await svc.from("notifications").insert(
          notifyIds.map((uid) => ({
            user_id: uid,
            type: "assignment_blocked",
            title: "Assignment blocked",
            body: `"${existing.text}" was blocked`,
            data: { action_item_id: id, meeting_id: existing.meeting_id, blocked_by: caller.id },
          }))
        );

        await audit(caller.id, caller.team_id, "action_item_block", "action_item", id, {
          text: existing.text,
        });

        const { data: updated } = await svc
          .from("action_items")
          .select("*, meetings!inner(title, scheduled_at, status), assignee:users!assignee_id(name, email)")
          .eq("id", id)
          .single();

        return ok(updated);
      }

      return err("Invalid action", 400);
    }

    // --- DELETE ---
    if (req.method === "DELETE" && id) {
      requireRole(caller, ADMIN_ROLES);

      const { error: delErr } = await svc
        .from("action_items")
        .delete()
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (delErr) return err(delErr.message);
      await audit(caller.id, caller.team_id, "action_item_delete", "action_item", id, {});
      return ok({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "action_items" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
