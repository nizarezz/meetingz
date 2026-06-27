export async function renderEmail(
  template: string,
  props: Record<string, unknown>
): Promise<string> {
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
  html: string
): Promise<void> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: "Terra Meetings", email: "nizarrtg@gmail.com" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Brevo error:", body);
    throw new Error(`Failed to send email: ${body}`);
  }
}

export async function sendNotificationEmail(
  to: string,
  template: string,
  subject: string,
  props: Record<string, unknown>
): Promise<void> {
  const html = await renderEmail(template, props);
  await sendEmail(to, subject, html);
}
