import { Container, List, Stack, Text } from "@mantine/core";
import LegalArticleLayout from "../components/LegalArticleLayout";
import LegalSection from "../components/LegalSection";

const lastUpdated = "June 29, 2026";

export default function PrivacyPolicyPage() {
  return (
    <Container className="policy-page" size="xl">
      <LegalArticleLayout
        lastUpdated={lastUpdated}
        title="Privacy Policy"
        toc={[
          { id: "who-we-are", label: "Who we are" },
          { id: "information-we-collect", label: "Information we collect" },
          { id: "how-we-use-information", label: "How we use information" },
          { id: "legal-bases", label: "Legal bases" },
          { id: "sharing-and-disclosure", label: "Sharing and disclosure" },
          { id: "retention", label: "Retention" },
          { id: "security", label: "Security" },
          { id: "choices-and-rights", label: "Your choices and rights" },
          { id: "cookies", label: "Cookies and similar technologies" },
          { id: "children", label: "Children" },
          { id: "contact", label: "Contact us" }
        ]}
      >
        <Text c="dimmed" lh={1.8}>
          This Privacy Policy explains how GetPrio collects, uses, stores, shares, and protects
          personal information when you use our website, booking flows, vendor pages, and related
          services. It is written for the capstone prototype and should be reviewed before any
          production use.
        </Text>

        <Stack gap="lg">
          <LegalSection id="who-we-are" title="1. Who we are">
            <Text lh={1.8}>
              GetPrio is a service marketplace and booking platform that helps guests discover
              vendors, customers make bookings, vendors manage services and queues, and platform
              administrators oversee the system.
            </Text>
          </LegalSection>

          <LegalSection id="information-we-collect" title="2. Information we collect">
            <Text lh={1.8}>
              We collect information you provide directly, information created during bookings and
              support interactions, and limited technical data needed to operate and secure the
              service.
            </Text>
            <List spacing="xs">
              <List.Item>Account details such as name, email address, phone number, and password hash.</List.Item>
              <List.Item>Profile details, preferences, and booking contact information.</List.Item>
              <List.Item>Booking data such as vendor, service selected, time, notes, status, and payment reference.</List.Item>
              <List.Item>Payment proof uploads and verification records when manual payment is required.</List.Item>
              <List.Item>Vendor and staff records such as business names, locations, roles, schedules, and assigned bookings.</List.Item>
              <List.Item>Security and diagnostic data such as login attempts, audit logs, timestamps, IP address, and device metadata.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="how-we-use-information" title="3. How we use information">
            <List spacing="xs">
              <List.Item>To create and manage accounts, authenticate users, and enforce role-based access.</List.Item>
              <List.Item>To process bookings, display vendor profiles, and support queue operations.</List.Item>
              <List.Item>To verify manual payment proof and confirm or reject bookings where needed.</List.Item>
              <List.Item>To send confirmations, reminders, status updates, and service notifications.</List.Item>
              <List.Item>To monitor abuse, troubleshoot issues, and maintain audit trails.</List.Item>
              <List.Item>To improve product performance, usability, and service reliability.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="legal-bases" title="4. Legal bases">
            <Text lh={1.8}>
              For a Philippines-oriented capstone framing, processing may rely on consent,
              contract performance, legitimate interests, legal obligations, and protection of
              vital interests where applicable. Sensitive booking or identity data is handled only
              when needed for the service and access control.
            </Text>
          </LegalSection>

          <LegalSection id="sharing-and-disclosure" title="5. Sharing and disclosure">
            <Text lh={1.8}>
              We do not sell personal information. We may share data with:
            </Text>
            <List spacing="xs">
              <List.Item>Vendors and authorized vendor staff for bookings, service delivery, and queue management.</List.Item>
              <List.Item>Service providers that host the app, store files, or send email and SMS notifications.</List.Item>
              <List.Item>Platform administrators who manage moderation, disputes, security, and compliance.</List.Item>
              <List.Item>Authorities when disclosure is required by law or necessary to protect rights and safety.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="retention" title="6. Retention">
            <Text lh={1.8}>
              We keep personal data only as long as needed for the purpose it was collected, to
              complete bookings, maintain business records, resolve disputes, meet legal obligations,
              and support system security. Some audit logs and transactional records may be retained
              longer for compliance and fraud prevention.
            </Text>
          </LegalSection>

          <LegalSection id="security" title="7. Security">
            <Text lh={1.8}>
              GetPrio uses role-based access control, secure session handling, transport encryption,
              private storage for payment proof, and audit logging to reduce unauthorized access,
              tampering, and leakage. No online system is completely secure, so we also review access
              patterns and limit privileged data exposure where possible.
            </Text>
          </LegalSection>

          <LegalSection id="choices-and-rights" title="8. Your choices and rights">
            <Text lh={1.8}>
              Depending on your role and applicable law, you may request access, correction,
              restriction, or deletion of certain personal data. Some records cannot be deleted
              immediately if they are needed for bookings, legal compliance, or legitimate business
              records.
            </Text>
          </LegalSection>

          <LegalSection id="cookies" title="9. Cookies and similar technologies">
            <Text lh={1.8}>
              GetPrio may use cookies or similar technologies to keep you signed in, remember session
              state, and improve the experience. We do not use these technologies to collect more
              information than is needed to operate the site.
            </Text>
          </LegalSection>

          <LegalSection id="children" title="10. Children">
            <Text lh={1.8}>
              GetPrio is not intended for children to create accounts or make bookings without
              appropriate supervision or authorization from a parent or guardian where required by
              law.
            </Text>
          </LegalSection>

          <LegalSection id="contact" title="11. Contact us">
            <Text lh={1.8}>
              If you have questions about this policy or your personal data, contact the GetPrio team
              through the contact flow or via the support channels in the app.
            </Text>
          </LegalSection>

          <Text c="dimmed" lh={1.75} size="sm">
            This page is a generic draft aligned with the GetPrio capstone architecture and is not
            legal advice.
          </Text>
        </Stack>
      </LegalArticleLayout>
    </Container>
  );
}
