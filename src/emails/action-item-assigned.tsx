import { Html, Body, Container, Text, Link, Section, Heading } from "@react-email/components";

interface ActionItemAssignedEmailProps {
  name: string;
  item: string;
  meetingTitle: string;
  dueDate?: string;
  meetingUrl: string;
  assignedBy: string;
}

export default function ActionItemAssignedEmail({
  name, item, meetingTitle, dueDate, meetingUrl, assignedBy,
}: ActionItemAssignedEmailProps) {
  return (
    <Html>
      <Body style={{ fontFamily: "system-ui, sans-serif", padding: "40px 20px", background: "#f5f5f5" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Action Item Assigned
          </Heading>
          <Text style={{ color: "#555", margin: "0 0 24px" }}>
            Hi {name}, you`&apos;`ve been assigned a new action item.
          </Text>

          <Section style={{ background: "#f9fafb", borderRadius: 6, padding: 16, marginBottom: 24 }}>
            <Text style={{ fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>{item}</Text>
            {dueDate && <Text style={{ color: "#999", fontSize: 13, margin: "0 0 4px" }}>Due: {dueDate}</Text>}
            <Text style={{ color: "#666", fontSize: 13, margin: 0 }}>Meeting: {meetingTitle}</Text>
            <Text style={{ color: "#999", fontSize: 12, margin: "4px 0 0" }}>Assigned by: {assignedBy}</Text>
          </Section>

          <Link
            href={meetingUrl}
            style={{
              display: "inline-block", background: "#000", color: "#fff",
              padding: "12px 24px", borderRadius: 6, textDecoration: "none", fontWeight: 500,
            }}
          >
            View Meeting
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
