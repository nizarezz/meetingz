import { render } from "@react-email/components";
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import ReminderEmail from "@/emails/reminder";
import OutcomePromptEmail from "@/emails/outcome-prompt";
import InvitationEmail from "@/emails/invitation";
import ActionItemAssignedEmail from "@/emails/action-item-assigned";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templates: Record<string, (props: any) => React.ReactElement> = {
  reminder: (props) => <ReminderEmail {...props} />,
  "outcome-prompt": (props) => <OutcomePromptEmail {...props} />,
  invitation: (props) => <InvitationEmail {...props} />,
  "action-item-assigned": (props) => <ActionItemAssignedEmail {...props} />,
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
