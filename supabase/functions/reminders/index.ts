import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { sendNotificationEmail } from "../_shared/resend.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return err("Method not allowed", 405);

  try {
    const svc = serviceClient();
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

    const { data: meetings, error } = await svc
      .from("meetings")
      .select("id, title, department, meeting_type, scheduled_at, team_id, created_by")
      .eq("status", "planned")
      .is("deleted_at", null)
      .gte("scheduled_at", now.toISOString())
      .lt("scheduled_at", inOneHour.toISOString());

    if (error) return err(error.message);

    let sent = 0;
    for (const meeting of meetings ?? []) {
      const { data: participants } = await svc
        .from("meeting_participants")
        .select("user_id, users!inner(id, email, name)")
        .eq("meeting_id", meeting.id);

      if (!participants?.length) continue;

      const userIds = participants.map((p: any) => p.user_id);

      const { data: prefs } = await svc
        .from("notification_preferences")
        .select("user_id")
        .in("user_id", userIds)
        .eq("meeting_reminder_email", true);

      const toNotify = (prefs ?? []).map((p: any) => {
        const part = participants.find((pp: any) => pp.user_id === p.user_id);
        return part?.users as { email: string; name: string } | undefined;
      }).filter(Boolean);

      for (const user of toNotify) {
        try {
          await sendNotificationEmail(user!.email, "reminder", `Reminder: ${meeting.title} starting soon`, {
            name: user!.name,
            title: meeting.title,
            department: meeting.department,
            meetingType: meeting.meeting_type,
            scheduledAt: meeting.scheduled_at
              ? new Date(meeting.scheduled_at).toLocaleString()
              : "No schedule",
            meetingUrl: `${Deno.env.get("APP_URL") ?? "http://localhost:3000"}/meetings/${meeting.id}`,
          });
          sent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          await captureException(msg, { context: "reminders-email" });
          console.error(`Failed to send reminder to ${user!.email}:`, e);
        }
      }
    }

    return ok({ sent });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    await captureException(msg, { context: "reminders" });
    console.error(e);
    return err("Internal server error", 500);
  }
});
