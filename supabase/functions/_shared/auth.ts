import { userClient } from "./supabase.ts";
import { corsHeaders, respond } from "./cors.ts";

export interface CallerInfo {
  id: string;
  role: string;
  team_id: string;
  client: ReturnType<typeof userClient>;
}

export const ADMIN_ROLES = ["super_admin", "dept_admin"] as const;
export const SUPER_ADMIN_ROLES = ["super_admin"] as const;

export async function resolveCaller(req: Request): Promise<CallerInfo> {
  const client = userClient(req);

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    throw respond(401, "Unauthorized");
  }

  const { data: profile, error: profileError } = await client
    .from("users")
    .select("id, role, team_id, is_approved")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (profileError || !profile) {
    throw respond(403, "User not found or deleted");
  }

  if (!profile.is_approved) {
    throw respond(403, "Account not yet approved");
  }

  return { id: profile.id, role: profile.role, team_id: profile.team_id, client };
}

export function requireRole(
  caller: CallerInfo,
  allowed: readonly string[]
): void {
  if (!allowed.includes(caller.role)) {
    throw new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
