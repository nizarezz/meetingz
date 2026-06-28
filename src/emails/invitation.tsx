import {
  Html, Body, Container, Text, Link, Section, Heading,
} from "@react-email/components";

interface InvitationEmailProps {
  name: string;
  teamName: string;
  appUrl: string;
  email: string;
  password: string;
}

export default function InvitationEmail({ name, teamName, appUrl, email, password }: InvitationEmailProps) {
  return (
    <Html>
      <Body style={{ fontFamily: "Nunito Sans, sans-serif", background: "#faf6f0", color: "#2e3230", padding: "40px 0" }}>
        <Container style={{ background: "#ffffff", borderRadius: "1rem", padding: "40px", maxWidth: "480px" }}>
          <Heading style={{ fontFamily: "Literata, serif", fontSize: "24px", color: "#4a7c59", margin: "0 0 8px" }}>
            Terra Meetings
          </Heading>
          <Text style={{ fontSize: "14px", color: "#4a4e4a", margin: "0 0 24px" }}>Rooted Productivity</Text>

          <Text style={{ fontSize: "16px", margin: "0 0 16px" }}>Hi {name},</Text>
          <Text style={{ fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
            You`&apos;`ve been invited to join <strong>{teamName}</strong> on Terra Meetings.
          </Text>

          <Section style={{ background: "#f0ece4", borderRadius: "0.75rem", padding: "20px", margin: "24px 0" }}>
            <Text style={{ fontSize: "12px", color: "#4a4e4a", margin: "0 0 8px", fontWeight: "700" }}>Your temporary credentials</Text>
            <Text style={{ fontSize: "14px", margin: "0 0 4px" }}>Email: <strong>{email}</strong></Text>
            <Text style={{ fontSize: "14px", margin: "0 0 12px" }}>Password: <strong>{password}</strong></Text>
            <Link
              href={appUrl}
              style={{
                display: "block",
                background: "#4a7c59",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: "700",
                textDecoration: "none",
                textAlign: "center" as const,
              }}
            >
              Sign in to Terra Meetings
            </Link>
          </Section>

          <Text style={{ fontSize: "12px", color: "#74796e", margin: "0 0 8px" }}>
            Please change your password after signing in. This password expires after first login.
          </Text>
          <Text style={{ fontSize: "12px", color: "#74796e", margin: "0" }}>
            If you weren`&apos;`t expecting this invitation, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
