import { userClient } from "./supabase.ts";
import { corsHeaders, respond } from "./cors.ts";

export interface CallerInfo {
  id: string;
  role: string;
  team_id: string;
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
    .select("id, role, team_id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (profileError || !profile) {
    throw respond(403, "User not found or deleted");
  }

  return profile as CallerInfo;
}

export function requireRole(
  caller: CallerInfo,
  allowed: string[]
): void {
  if (!allowed.includes(caller.role)) {
    throw new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
