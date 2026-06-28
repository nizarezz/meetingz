function parseDsn(dsn: string): { host: string; projectId: string; publicKey: string } | null {
  // Format: https://publicKey@host/projectId
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

export async function captureException(
  error: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const dsn = Deno.env.get("SENTRY_DSN") ?? Deno.env.get("NEXT_PUBLIC_SENTRY_DSN");
  if (!dsn) return;

  const parsed = parseDsn(dsn);
  if (!parsed) return;

  const body = JSON.stringify({
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "deno",
    logger: "meetingz-jobs",
    level: "error",
    message: { formatted: error },
    exception: { values: [{ type: "JobDeadLetter", value: error }] },
    extra,
  });

  try {
    const res = await fetch(
      `https://${parsed.host}/api/${parsed.projectId}/store/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=meetingz-jobs/1.0, sentry_key=${parsed.publicKey}`,
        },
        body,
      },
    );
    if (!res.ok) console.error("Sentry store failed:", await res.text());
  } catch (e) {
    console.error("Sentry send failed:", e);
  }
}
