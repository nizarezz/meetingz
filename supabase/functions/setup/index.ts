import { ok, err, preflight } from "../_shared/cors.ts";
import { userClient, serviceClient } from "../_shared/supabase.ts";
import { captureException } from "../_shared/sentry.ts";

async function setMetadata(id: string, role: string) {
  const svc = serviceClient();
  const { error } = await svc.auth.admin.updateUserById(id, {
    user_metadata: { role },
  });
  if (error) console.error("[setup] Failed to set user_metadata:", error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return err("Method not allowed", 405);

  try {
    const client = userClient(req);
    const { data: { user }, error: authError } = await client.auth.getUser();

    if (authError || !user) {
      return err("Unauthorized", 401);
    }

    if (!user.email) {
      return err("Email is required");
    }

    const svc = serviceClient();

    const { data: existingProfile } = await svc
      .from("users")
      .select("id, team_id, role")
      .eq("id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.team_id) {
        await setMetadata(user.id, existingProfile.role ?? "member");
        return ok({
          team_id: existingProfile.team_id,
          user_id: existingProfile.id,
          already_setup: true,
        });
      }
      const rawName = user.user_metadata?.name as string | undefined;
      const displayName = rawName || user.email.split("@")[0];
      const teamName = `${displayName}'s Team`;
      const { data: team, error: teamErr } = await svc
        .from("teams")
        .insert({ name: teamName })
        .select()
        .single();
      if (teamErr) return err(teamErr.message);
      const { error: updateErr } = await svc
        .from("users")
        .update({ team_id: team.id })
        .eq("id", user.id);
      if (updateErr) return err(updateErr.message);
      await setMetadata(user.id, existingProfile.role ?? "member");
      return ok({
        team_id: team.id,
        user_id: existingProfile.id,
        already_setup: false,
      }, 201);
    }

    const rawName = user.user_metadata?.name as string | undefined;
    const displayName = rawName || user.email.split("@")[0];
    const teamName = `${displayName}'s Team`;

    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({ name: teamName })
      .select()
      .single();

    if (teamErr) return err(teamErr.message);

    const { data: profile, error: profileErr } = await svc
      .from("users")
      .insert({
        id: user.id,
        email: user.email,
        name: displayName,
        team_id: team.id,
        role: "member",
        is_approved: true,
      })
      .select()
      .single();

    if (profileErr) {
      await svc.from("teams").delete().eq("id", team.id);
      return err(profileErr.message);
    }

    await setMetadata(user.id, "member");

    return ok({
      team_id: team.id,
      user_id: profile.id,
      already_setup: false,
    }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "setup" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
