import { userClient, serviceClient } from "./supabase.ts";
import { corsHeaders, respond } from "./cors.ts";

export interface CallerInfo {
  id: string;
  role: string;
  team_id: string;
  department: string | null;
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
    .select("id, role, team_id, department, is_approved")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (profileError || !profile) {
    throw respond(403, "User not found or deleted");
  }

  if (!profile.is_approved) {
    throw respond(403, "Account not yet approved");
  }

  return { id: profile.id, role: profile.role, team_id: profile.team_id, department: profile.department, client };
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

export async function requireDeptAccess(
  caller: CallerInfo,
  assigneeId: string,
  svc: ReturnType<typeof serviceClient>,
): Promise<{ crossDept: boolean }> {
  if (caller.role === "super_admin") {
    return { crossDept: false };
  }

  const { data: assignee } = await svc
    .from("users")
    .select("department")
    .eq("id", assigneeId)
    .single();

  if (!assignee) {
    throw respond(404, "Assignee not found");
  }

  const crossDept = caller.department !== assignee.department;
  if (crossDept && caller.role !== "dept_admin") {
    throw respond(403, "Cannot assign outside your department");
  }

  return { crossDept };
}

export async function requireHostOrSuperAdmin(
  caller: CallerInfo,
  meetingId: string,
  svc: ReturnType<typeof serviceClient>,
): Promise<void> {
  if (caller.role === "super_admin") return;

  const { data: meeting } = await svc
    .from("meetings")
    .select("created_by")
    .eq("id", meetingId)
    .single();

  if (!meeting) {
    throw respond(404, "Meeting not found");
  }

  if (meeting.created_by !== caller.id) {
    throw respond(403, "Only the meeting host can perform this action");
  }
}

export async function requireMeetingOpen(
  meetingId: string,
  svc: ReturnType<typeof serviceClient>,
): Promise<void> {
  const { data: meeting } = await svc
    .from("meetings")
    .select("status")
    .eq("id", meetingId)
    .single();

  if (!meeting) {
    throw respond(404, "Meeting not found");
  }

  if (meeting.status === "logged") {
    throw respond(409, "Meeting is logged and cannot be modified");
  }
}
