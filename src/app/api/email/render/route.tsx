import { render } from "@react-email/components";
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import ReminderEmail from "@/emails/reminder";
import OutcomePromptEmail from "@/emails/outcome-prompt";
import InvitationEmail from "@/emails/invitation";
import ActionItemAssignedEmail from "@/emails/action-item-assigned";

const templates: Record<string, (props: Record<string, unknown>) => React.ReactElement> = {
  reminder: (props) => <ReminderEmail {...(props as any)} />,
  "outcome-prompt": (props) => <OutcomePromptEmail {...(props as any)} />,
  invitation: (props) => <InvitationEmail {...(props as any)} />,
  "action-item-assigned": (props) => <ActionItemAssignedEmail {...(props as any)} />,
};

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.EMAIL_RENDER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { template, props } = await req.json();
  const component = templates[template as string];
  if (!component) return NextResponse.json({ error: "Unknown template" }, { status: 400 });

  const html = await render(component(props ?? {}));
  return NextResponse.json({ html });
}
