import { Anchor, Container, List, Stack, Text } from "@mantine/core";
import LegalArticleLayout from "../components/LegalArticleLayout";
import LegalSection from "../components/LegalSection";

const lastUpdated = "September 7, 2026";

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
          personal information when you use the GetPrio website, GetPrio Mobile app, queue and
          booking flows, vendor pages, and related services. The information processed depends
          on your role and the features you use.
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
              <List.Item>Profile details, profile photos you upload, preferences, favorite vendors, and booking contact information.</List.Item>
              <List.Item>Queue and booking data such as vendor, service selected, ticket identifiers, position, join and service times, estimated waits, notes, status, and payment reference.</List.Item>
              <List.Item>Payment proof uploads and verification records when manual payment is required.</List.Item>
              <List.Item>Organizer campaign details, contributor membership, payment instructions, contribution and reimbursement evidence, review decisions, reports, and audit events.</List.Item>
              <List.Item>Public vendor reviews and private role-scoped user trust ratings, including rating appeals and moderation decisions.</List.Item>
              <List.Item>Notification preferences, including your permitted campaign contact channel, and push registration data linked to your account, including an app installation identifier, notification token, platform, app version, app locale, and delivery success or failure records. Browser notifications use a push subscription endpoint and encryption keys.</List.Item>
              <List.Item>Vendor and staff records such as business names, locations, roles, schedules, and assigned bookings.</List.Item>
              <List.Item>Security and diagnostic data such as login attempts, audit logs, timestamps, IP address, and device metadata.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="how-we-use-information" title="3. How we use information">
            <List spacing="xs">
              <List.Item>To create and manage accounts, authenticate users, and enforce role-based access.</List.Item>
              <List.Item>To process bookings, display vendor profiles and saved favorites, manage queue tickets, and calculate and update estimated waiting times.</List.Item>
              <List.Item>To verify manual payment proof and confirm or reject bookings where needed.</List.Item>
              <List.Item>To send confirmations, reminders, status updates, and service notifications.</List.Item>
              <List.Item>To operate organizer-collected campaigns, record contributor proof decisions and reimbursements, calculate privacy-safe rating aggregates, and resolve reports or appeals.</List.Item>
              <List.Item>To monitor abuse, troubleshoot issues, and maintain audit trails.</List.Item>
              <List.Item>To improve product performance, usability, and service reliability.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="legal-bases" title="4. Legal bases">
            <Text lh={1.8}>
              We process personal information to provide the services you request, meet applicable
              legal obligations, and pursue legitimate interests such as securing the service and
              preventing abuse, subject to your rights. Where consent is required, we ask for it
              and provide ways to withdraw it. The applicable basis depends on the information,
              purpose, and law, including the Philippine Data Privacy Act of 2012.
            </Text>
          </LegalSection>

          <LegalSection id="sharing-and-disclosure" title="5. Sharing and disclosure">
            <Text lh={1.8}>
              We do not sell personal information. We may share data with:
            </Text>
            <List spacing="xs">
              <List.Item>Vendors and authorized vendor staff for bookings, service delivery, and queue management.</List.Item>
              <List.Item>Service providers that host the service, store files, process payments, or deliver email and push notifications.</List.Item>
              <List.Item>Platform administrators who manage moderation, disputes, security, and compliance.</List.Item>
              <List.Item>Authorities when disclosure is required by law or necessary to protect rights and safety.</List.Item>
            </List>
            <Text lh={1.8} mt="sm">
              GetPrio Mobile uses Google Firebase Cloud Messaging and, on Apple devices, Apple
              Push Notification service to deliver notifications. These providers process app
              installation identifiers, notification tokens, message payloads, and technical
              information needed to operate their services. See the{" "}
              <Anchor href="https://firebase.google.com/support/privacy">Firebase privacy information</Anchor>.
              Service providers may process information outside your country.
            </Text>
            <Text lh={1.8} mt="sm">
              Vendor profiles and reviews submitted for public display can be seen by other users.
              When checkout opens a payment provider’s website, information you enter there is
              handled under that provider’s privacy policy. GetPrio receives the transaction
              information needed to associate payments with your queue or booking.
            </Text>
            <Text lh={1.8} mt="sm">Campaign payment instructions and evidence are limited to the organizer and the relevant contributor. Vendors and public viewers do not receive campaign payment references, proof files, contributor identities, reimbursement records, or private trust-rating notes. Platform Admin access is case-scoped to a report, dispute, or audit need.</Text>
          </LegalSection>

          <LegalSection id="retention" title="6. Retention">
            <Text lh={1.8}>
              We keep personal data only as long as needed for the purpose it was collected, to
              complete bookings, maintain business records, resolve disputes, meet legal obligations,
              and support system security. Some audit logs and transactional records may be retained
              longer for compliance and fraud prevention.
            </Text>
            <Text lh={1.8}>Campaign evidence, rating disputes, and audit records follow a documented purpose-based retention schedule and are deleted or de-identified when no longer needed for an active booking, complaint, legal obligation, security investigation, or data-subject request. Production launch requires that schedule and storage deletion process to be approved in the Privacy Impact Assessment.</Text>
            <Text lh={1.8}>Retention varies by record type and purpose; there is no single deletion period for all records. Contact us to request deletion or information about retention of your records. Turning off notification permission or uninstalling the app does not itself delete your account, transaction history, or server-side notification registration records.</Text>
          </LegalSection>

          <LegalSection id="security" title="7. Security">
            <Text lh={1.8}>
              GetPrio uses role-based access control, secure session handling, transport encryption,
              private storage for payment proof, and audit logging to reduce unauthorized access,
              tampering, and leakage. No online system is completely secure, so we also review access
              patterns and limit privileged data exposure where possible.
            </Text>
            <Text lh={1.8}>Notification messages, including future silent push notifications, contain only the minimum event context and never include payment instructions, proof images, payment references, private notes, or bank details.</Text>
            <Text lh={1.8}>Queue notifications may include a service or vendor name, ticket identifier, and status information. Depending on your device settings, notifications may be visible on your lock screen. You can hide previews or disable notifications in your device settings.</Text>
          </LegalSection>

          <LegalSection id="choices-and-rights" title="8. Your choices and rights">
            <Text lh={1.8}>
              Depending on your role and applicable law, you may request access, correction,
              restriction, or deletion of certain personal data. Some records cannot be deleted
              immediately if they are needed for bookings, legal compliance, or legitimate business
              records.
            </Text>
            <Text lh={1.8}>
              You can update available profile and notification settings in your account. For
              access, correction, or deletion requests, use our{" "}
              <Anchor href="/contact">contact page</Anchor> and identify the account concerned.
              We may need to verify your identity before acting on a request. Please do not send
              your password or authentication codes. Removing the app does not close your account.
            </Text>
            <Text lh={1.8}>
              Where Delete account is available in Profile &gt; Security, you can confirm deletion
              directly in the app. When we accept your verified request, account access stops and
              waiting queue tickets, including pending carry-over tickets, are cancelled. Tickets
              already called for service remain with the vendor. We provide a request reference and
              a deadline within 30 days, then notify you when deletion is complete. Only records
              with a documented retention basis may remain, with the applicable reason and period
              explained in the completion notice. Deletion does not automatically refund payments
              or cancel bookings with a vendor.
            </Text>
            <Text lh={1.8}>
              Camera access supports QR scanning; photo access lets you
              choose an image to upload. QR scanning reads codes on your device; the scanned queue
              identifier is used to retrieve queue details. A selected profile image is uploaded
              when you submit it. Biometric sign-in uses your device’s authentication service;
              GetPrio does not receive your fingerprint or face template. You can manage camera,
              photo, and notification permissions in device settings, and biometric sign-in in the
              app’s security settings.
            </Text>
          </LegalSection>

          <LegalSection id="cookies" title="9. Cookies and similar technologies">
            <Text lh={1.8}>
              The website uses cookies and browser storage for sign-in, preferences, and queue access
              details. On a shared device, sign out and clear browser data when appropriate. The
              mobile app uses local storage for preferences and secure device storage for
              authentication credentials. Clearing storage may sign you out or reset preferences.
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
              through our <Anchor href="/contact">contact page</Anchor>. State that your request
              concerns privacy and describe what you need so we can route it appropriately.
            </Text>
          </LegalSection>

          <Text c="dimmed" lh={1.75} size="sm">
            We may update this policy as our services or privacy practices change. The date above
            identifies the latest revision. We will provide additional notice where required.
          </Text>
        </Stack>
      </LegalArticleLayout>
    </Container>
  );
}
