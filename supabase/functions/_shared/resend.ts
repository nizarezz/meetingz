function renderActionItemAssigned(props: Record<string, unknown>): string {
  const { name, item, meetingTitle, dueDate, meetingUrl, assignedBy } = props as Record<string, string>;
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;padding:40px 20px;background:#f5f5f5">
<table role="presentation" style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
<tr><td>
<h1 style="font-size:20px;font-weight:600;margin:0 0 8px">Action Item Assigned</h1>
<p style="color:#555;margin:0 0 24px">Hi ${name}, you've been assigned a new action item.</p>
<table role="presentation" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:24px;width:100%">
<tr><td>
<p style="font-weight:600;font-size:16px;margin:0 0 4px">${item}</p>
${dueDate ? `<p style="color:#999;font-size:13px;margin:0 0 4px">Due: ${dueDate}</p>` : ""}
<p style="color:#666;font-size:13px;margin:0">Meeting: ${meetingTitle}</p>
<p style="color:#999;font-size:12px;margin:4px 0 0">Assigned by: ${assignedBy}</p>
</td></tr></table>
<a href="${meetingUrl}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500">View Meeting</a>
</td></tr></table></body></html>`;
}

export async function renderEmail(
  template: string,
  props: Record<string, unknown>
): Promise<string> {
  if (template === "action-item-assigned") {
    return renderActionItemAssigned(props);
  }

  const url = Deno.env.get("APP_URL") ?? "http://localhost:3000";
  const secret = Deno.env.get("EMAIL_RENDER_SECRET");

  const res = await fetch(`${url}/api/email/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ template, props }),
  });

  if (!res.ok) throw new Error(`Render failed: ${await res.text()}`);
  const { html } = await res.json();
  return html;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<void> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  const body: Record<string, unknown> = {
    sender: { name: "Terra Meetings", email: "nizarrtg@gmail.com" },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    console.error("Brevo error:", bodyText);
    throw new Error(`Failed to send email: ${bodyText}`);
  }
}

export async function sendNotificationEmail(
  to: string,
  template: string,
  subject: string,
  props: Record<string, unknown>,
  replyTo?: string
): Promise<void> {
  const html = await renderEmail(template, props);
  await sendEmail(to, subject, html, replyTo);
}
