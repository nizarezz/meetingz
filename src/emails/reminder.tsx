import {
  Html, Head, Preview, Body, Container, Section, Text, Link, Heading, Hr,
} from "@react-email/components";

interface ReminderEmailProps {
  name: string;
  title: string;
  department: string;
  meetingType: string;
  scheduledAt: string;
  meetingUrl: string;
}

export default function ReminderEmail({
  name, title, department, meetingType, scheduledAt, meetingUrl,
}: ReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Meeting Reminder: {title}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", padding: "40px 20px", background: "#f5f5f5" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            ⏰ Meeting Reminder
          </Heading>
          <Text style={{ color: "#555", margin: "0 0 24px" }}>
            Hi {name}, you have a meeting starting soon.
          </Text>

          <Section style={{ background: "#f9fafb", borderRadius: 6, padding: 16, marginBottom: 24 }}>
            <Text style={{ fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>{title}</Text>
            <Text style={{ color: "#666", fontSize: 14, margin: "0 0 2px" }}>{department} &middot; {meetingType}</Text>
            <Text style={{ color: "#666", fontSize: 14, margin: 0 }}>{scheduledAt}</Text>
          </Section>

          <Link
            href={meetingUrl}
            style={{
              display: "inline-block", background: "#000", color: "#fff",
              padding: "12px 24px", borderRadius: 6, textDecoration: "none", fontWeight: 500,
            }}
          >
            Open Meeting
          </Link>

          <Hr style={{ margin: "24px 0", borderColor: "#eee" }} />
          <Text style={{ fontSize: 12, color: "#999", textAlign: "center" }}>
            Meeting Timer Pro
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
