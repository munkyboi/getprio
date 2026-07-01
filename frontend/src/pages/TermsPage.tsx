import { Alert, Container, List, Stack, Text } from "@mantine/core";
import LegalArticleLayout from "../components/LegalArticleLayout";
import LegalSection from "../components/LegalSection";

const lastUpdated = "June 30, 2026";

export default function TermsPage() {
  return (
    <Container className="policy-page" size="xl">
      <LegalArticleLayout
        lastUpdated={lastUpdated}
        title="Terms of Service"
        toc={[
          { id: "acceptance", label: "Acceptance of terms" },
          { id: "who-may-use", label: "Who may use GetPrio" },
          { id: "accounts-and-security", label: "Accounts and security" },
          { id: "role-based-access", label: "Role-based access" },
          { id: "bookings-and-service-use", label: "Bookings and service use" },
          { id: "payment-and-proof", label: "Payment and proof handling" },
          { id: "cancellations-and-refunds", label: "Cancellations and refunds" },
          { id: "user-conduct", label: "User content and conduct" },
          { id: "vendor-and-staff", label: "Vendor and staff obligations" },
          { id: "service-availability", label: "Service availability" },
          { id: "suspension-and-termination", label: "Suspension and termination" },
          { id: "intellectual-property", label: "Intellectual property" },
          { id: "disclaimers", label: "Disclaimers and limitation of liability" },
          { id: "changes", label: "Changes to these terms" },
          { id: "contact", label: "Contact" }
        ]}
      >
        <Text c="dimmed" lh={1.8}>
          These Terms of Service govern your use of GetPrio, including public browsing, account
          registration, booking flows, vendor dashboards, queue tools, and related services. This
          is a capstone-friendly draft and should be reviewed before any production use.
        </Text>

        <Stack gap="lg">
          <LegalSection id="acceptance" title="1. Acceptance of terms">
            <Text lh={1.8}>
              By accessing or using GetPrio, you agree to these Terms and to any additional policies
              referenced in the app, including our Privacy Policy. If you do not agree, do not use
              the service.
            </Text>
          </LegalSection>

          <LegalSection id="who-may-use" title="2. Who may use GetPrio">
            <Text lh={1.8}>
              GetPrio is intended for guests, customers, vendor staff, vendor administrators, and
              platform administrators. You must provide accurate information, keep your account
              secure, and only use the access assigned to your role.
            </Text>
          </LegalSection>

          <LegalSection id="accounts-and-security" title="3. Accounts and security">
            <List spacing="xs">
              <List.Item>You are responsible for all activity under your account.</List.Item>
              <List.Item>You must keep passwords, verification codes, and session access confidential.</List.Item>
              <List.Item>You must notify us promptly if you suspect unauthorized access or misuse.</List.Item>
              <List.Item>We may lock, suspend, or restrict accounts that appear compromised or abusive.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="role-based-access" title="4. Role-based access">
            <Text lh={1.8}>
              Access within GetPrio is role-based. Guests can view public vendor information. Customers
              can manage their own profile and bookings. Vendor staff and vendor admins may only use
              the features assigned to their tenant. Platform admins may access governance tools and
              platform records necessary for moderation, support, and compliance.
            </Text>
          </LegalSection>

          <LegalSection id="bookings-and-service-use" title="5. Bookings and service use">
            <List spacing="xs">
              <List.Item>Bookings are subject to vendor availability, operating hours, and service rules.</List.Item>
              <List.Item>Booking details must be accurate, including contact information and selected service.</List.Item>
              <List.Item>Some bookings may require manual payment proof upload and vendor verification.</List.Item>
              <List.Item>Pending bookings may expire if required actions are not completed in time.</List.Item>
              <List.Item>Vendors may reschedule, reject, or cancel bookings according to their policies and platform rules.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="payment-and-proof" title="6. Payment and proof handling">
            <Text lh={1.8}>
              Where GetPrio supports manual payment, you are responsible for sending proof that is
              accurate and legible. Payment references, screenshots, and related records may be
              retained for verification, dispute handling, and audit purposes. GetPrio does not
              guarantee the outcome of external payment transactions.
            </Text>
          </LegalSection>

          <LegalSection id="cancellations-and-refunds" title="7. Cancellations and refunds">
            <Text lh={1.8}>
              Booking cancellation rules depend on the booking status at the time you cancel and on
              who initiates the cancellation. The current policy is designed for booking-only use
              and does not create a platform-managed refund processor.
            </Text>
            <List spacing="xs">
              <List.Item>
                Customers may cancel a booking before check-in while the booking is still pending
                vendor acceptance or confirmation.
              </List.Item>
              <List.Item>
                If a customer cancels after the vendor has already accepted or confirmed the
                booking, any collected payment is forfeited to cover financial losses.
              </List.Item>
              <List.Item>
                Late check-in and no-show bookings are non-refundable.
              </List.Item>
              <List.Item>
                If a vendor cancels before service delivery, the vendor is responsible for issuing
                a full refund of any collected booking payment.
              </List.Item>
              <List.Item>
                Refunds are handled by the vendor, not by GetPrio, and any manual refund timing or
                payment-method details must be confirmed directly with the vendor.
              </List.Item>
              <List.Item>
                If service has already started or if a cancellation involves partial performance,
                the outcome is handled case by case.
              </List.Item>
            </List>
            <Alert color="yellow" variant="light">
              Customers should expect to lose the booking payment once they cancel after vendor
              acceptance or confirmation.
            </Alert>
          </LegalSection>

          <LegalSection id="user-conduct" title="8. User content and conduct">
            <Text lh={1.8}>
              You agree not to submit unlawful, abusive, misleading, or harmful content. You must not
              attempt to exploit the platform, interfere with other users, upload malware, scrape data
              without permission, or bypass access controls.
            </Text>
            <List spacing="xs">
              <List.Item>No harassment, impersonation, fraud, spam, or review manipulation.</List.Item>
              <List.Item>No attempts to tamper with bookings, queue positions, payment records, or staff access.</List.Item>
              <List.Item>No storing or sharing content that violates privacy or intellectual property rights.</List.Item>
            </List>
          </LegalSection>

          <LegalSection id="vendor-and-staff" title="9. Vendor and staff obligations">
            <Text lh={1.8}>
              Vendors are responsible for maintaining accurate business information, assigning staff
              appropriately, and handling customer data only for legitimate operational purposes.
              Vendor staff may not use access granted to another person, and vendors are responsible
              for actions taken within their workspace.
            </Text>
          </LegalSection>

          <LegalSection id="service-availability" title="10. Service availability">
            <Text lh={1.8}>
              We aim to keep GetPrio available, but the service may be interrupted for maintenance,
              updates, outages, or events beyond our control. We do not guarantee uninterrupted or
              error-free operation.
            </Text>
          </LegalSection>

          <LegalSection id="suspension-and-termination" title="11. Suspension and termination">
            <Text lh={1.8}>
              We may suspend or terminate access if we believe a user has violated these Terms,
              created a security risk, abused the platform, or otherwise acted in a way that harms
              users, vendors, or the service.
            </Text>
          </LegalSection>

          <LegalSection id="intellectual-property" title="12. Intellectual property">
            <Text lh={1.8}>
              The GetPrio name, logo, interface design, and related content are protected by
              intellectual property laws. You may not copy, resell, or reuse them without permission,
              except as allowed for normal use of the service.
            </Text>
          </LegalSection>

          <LegalSection id="disclaimers" title="13. Disclaimers and limitation of liability">
            <Text lh={1.8}>
              GetPrio is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the extent allowed by
              law, we disclaim warranties of merchantability, fitness for a particular purpose, and
              non-infringement, and we are not liable for indirect or consequential losses caused by
              service interruptions, third-party actions, or misuse of the platform.
            </Text>
          </LegalSection>

          <LegalSection id="changes" title="14. Changes to these terms">
            <Text lh={1.8}>
              We may update these Terms from time to time. If changes are material, we may display an
              in-app notice or update the last modified date. Continued use of GetPrio after changes
              take effect means you accept the updated Terms.
            </Text>
          </LegalSection>

          <LegalSection id="contact" title="15. Contact">
            <Text lh={1.8}>
              If you have questions about these Terms, contact the GetPrio team through the support
              channels in the app or the public contact page.
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
