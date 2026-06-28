import { ok, err, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { sendNotificationEmail } from "../_shared/resend.ts";

const BATCH_SIZE = 10;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${Deno.env.get("CRON_SECRET")}`) {
      return err("Unauthorized", 401);
    }

    const svc = serviceClient();

    const { data: jobs } = await svc
      .from("job_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!jobs?.length) return ok({ processed: 0 });

    let processed = 0;

    for (const job of jobs) {
      await svc
        .from("job_queue")
        .update({ status: "processing", attempts: job.attempts + 1 })
        .eq("id", job.id);

      try {
        await processJob(job, svc);
        await svc
          .from("job_queue")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", job.id);
        processed++;
      } catch (e) {
        const error = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : "Unknown error";
        const isDeadLetter = job.attempts + 1 >= job.max_attempts;
        const nextStatus = isDeadLetter ? "failed" : "pending";

        if (isDeadLetter) {
          console.error(
            `[JOB_DEAD_LETTER] job=${job.id} type=${job.type} attempts=${job.attempts + 1}/${job.max_attempts} error=${error}`
          );
        } else {
          console.warn(
            `[JOB_RETRY] job=${job.id} type=${job.type} attempt=${job.attempts + 1}/${job.max_attempts} error=${error}`
          );
        }

        await svc
          .from("job_queue")
          .update({ status: nextStatus, error: error.slice(0, 2000) })
          .eq("id", job.id);
      }
    }

    return ok({ processed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return err("Internal server error", 500);
  }
});

async function processJob(job: { type: string; payload: Record<string, unknown> }, svc: ReturnType<typeof serviceClient>) {
  switch (job.type) {
    case "send-email": {
      const { to, template, subject, data, replyTo } = job.payload as Record<string, string>;
      await sendNotificationEmail(to, template, subject, JSON.parse(data as string), replyTo);
      break;
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}
