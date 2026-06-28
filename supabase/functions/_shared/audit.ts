import { serviceClient } from "./supabase.ts";

export async function audit(
  actor_id: string,
  team_id: string,
  action: string,
  entity_type: string,
  entity_id?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await serviceClient()
      .from("audit_log")
      .insert({ actor_id, team_id, action, entity_type, entity_id, details: details ?? {} });
  } catch (e) {
    console.error("Audit log insert failed:", e);
  }
}
