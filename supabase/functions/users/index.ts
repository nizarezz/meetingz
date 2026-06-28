import { ok, err, preflight, paginated } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { resolveCaller, requireRole, ADMIN_ROLES, SUPER_ADMIN_ROLES } from "../_shared/auth.ts";
import { sendNotificationEmail } from "../_shared/resend.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const caller = await resolveCaller(req);
    const url    = new URL(req.url);
    const parts  = url.pathname.replace(/^\/users\/?/, "").split("/").filter(Boolean);
    const id     = parts[0] ?? null;
    const action = parts[1] ?? null;

    const svc = serviceClient();

    if (req.method === "GET" && !id) {
      const department = url.searchParams.get("department");
      const role       = url.searchParams.get("role");
      const page       = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
      const perPage    = Math.max(1, Math.min(100, parseInt(url.searchParams.get("per_page") ?? "50", 10)));
      const from       = (page - 1) * perPage;
      const to         = from + perPage - 1;

      const search = url.searchParams.get("search");

      let query = svc
        .from("users")
        .select("id, email, name, role, department, is_approved, created_at", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (caller.team_id) query = query.eq("team_id", caller.team_id);
      if (department) query = query.eq("department", department);
      if (role)       query = query.eq("role", role);
      if (search)     query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

      query = query.range(from, to);
      const { data, error, count } = await query;
      if (error) return err(error.message);
      return paginated(data ?? [], page, perPage, count ?? 0);
    }

    if (req.method === "GET" && id) {
      const { data, error } = await svc
        .from("users")
        .select("id, email, name, role, department, is_approved, fcm_token, created_at")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      if (error || !data) return err("User not found", 404);
      return ok(data);
    }

    if (req.method === "PATCH" && id && !action) {
      if (caller.id !== id) return err("You can only update your own profile", 403);

      const body = await req.json();
      const allowed = ["name", "department", "fcm_token"];
      const patch: Record<string, unknown> = {};

      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      if (Object.keys(patch).length === 0) return err("No valid fields to update");

      const { data, error } = await svc
        .from("users")
        .update(patch)
        .eq("id", id)
        .select("id, email, name, role, department, is_approved")
        .single();

      if (error) return err(error.message);
      return ok(data);
    }

    if (req.method === "PATCH" && id && action === "approve") {
      requireRole(caller, ADMIN_ROLES);

      const { data, error } = await svc
        .from("users")
        .update({ is_approved: true })
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .select("id, email, name, role, department, is_approved")
        .single();

      if (error) return err(error.message, 404);
      return ok(data);
    }

    if (req.method === "PATCH" && id && action === "deactivate") {
      requireRole(caller, ADMIN_ROLES);

      if (id === caller.id) return err("Cannot deactivate yourself", 403);

      const { data: target } = await svc
        .from("users")
        .select("role")
        .eq("id", id)
        .eq("team_id", caller.team_id)
        .is("deleted_at", null)
        .single();

      if (!target) return err("User not found", 404);

      if (!SUPER_ADMIN_ROLES.includes(caller.role as any) && ADMIN_ROLES.includes(target.role as any)) {
        return err("Cannot deactivate an admin or super admin", 403);
      }

      const { error } = await svc
        .from("users")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", caller.team_id);

      if (error) return err(error.message);
      return ok({ deactivated: true });
    }

    if (req.method === "POST" && id === "invite") {
      requireRole(caller, ADMIN_ROLES);
      checkRateLimit(`invite:${caller.team_id}`, 10, "invites");

      const body = await req.json();
      const { email, name, department, role = "member" } = body;

      if (!email) return err("email is required");
      const displayName = name || email.split("@")[0];

      const { data: existing } = await svc
        .from("users")
        .select("id, deleted_at")
        .eq("email", email)
        .maybeSingle();

      if (existing && !existing.deleted_at) {
        return err("A user with this email already exists in your team");
      }

      if (existing?.deleted_at) {
        const { data, error } = await svc
          .from("users")
          .update({
            name: displayName,
            department: department ?? null,
            role,
            is_approved: true,
            deleted_at: null,
          })
          .eq("id", existing.id)
          .select("id, email, name, role, department, is_approved")
          .single();

        if (error) return err(error.message);
        return ok(data);
      }

      const tempPassword = crypto.randomUUID().slice(0, 12) + "Tg1!";
      const { data: newUser, error: inviteErr } = await svc.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (inviteErr) return err(inviteErr.message);
      if (!newUser?.user?.id) return err("Failed to create user");

      const { data: profile, error: profileErr } = await svc
        .from("users")
        .insert({
          id: newUser.user.id,
          email,
          name: displayName,
          department: department ?? null,
          role,
          team_id: caller.team_id,
          is_approved: true,
        })
        .select("id, email, name, role, department, is_approved")
        .single();

      if (profileErr) {
        return err(profileErr.message);
      }

      await svc.auth.admin.updateUserById(newUser.user.id, {
        user_metadata: { role, name: displayName, department },
      });

      const { data: team } = await svc
        .from("teams")
        .select("name")
        .eq("id", caller.team_id)
        .single();

      const baseUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
      try {
        await sendNotificationEmail(email, "invitation", `You're invited to ${team?.name ?? "Terra Meetings"}`, {
          name: displayName,
          teamName: team?.name ?? "the team",
          appUrl: baseUrl,
          email,
          password: tempPassword,
        });
      } catch (e) {
        console.error("Failed to send invitation email:", e);
      }

      return ok(profile, 201);
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});
