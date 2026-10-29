import { Alert } from "@vendor/components/ui/alert";
import LegalArticleLayout from "./LegalArticleLayout";
import LegalSection from "./LegalSection";

const lastUpdated = "September 30, 2026";

export default function TermsPage() {
  return (
    <div className="marketing-page policy-page">
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
        <p>
          These Terms of Service govern your use of GetPrio, which is owned and operated by
          MNK-Labs Software Development Services, including public browsing, account registration,
          booking flows, vendor dashboards, queue tools, and related services. This
          is a capstone-friendly draft and should be reviewed before any production use.
        </p>

        <div>
          <LegalSection id="acceptance" title="1. Acceptance of terms">
            <p>
              By accessing or using GetPrio, you agree to these Terms and to any additional policies
              referenced in the app, including our Privacy Policy. If you do not agree, do not use
              the service.
            </p>
          </LegalSection>

          <LegalSection id="who-may-use" title="2. Who may use GetPrio">
            <p>
              GetPrio is intended for guests, customers, vendor staff, vendor administrators, and
              platform administrators. You must provide accurate information, keep your account
              secure, and only use the access assigned to your role.
            </p>
          </LegalSection>

          <LegalSection id="accounts-and-security" title="3. Accounts and security">
            <ul>
              <li>You are responsible for all activity under your account.</li>
              <li>You must keep passwords, verification codes, and session access confidential.</li>
              <li>You must notify us promptly if you suspect unauthorized access or misuse.</li>
              <li>We may lock, suspend, or restrict accounts that appear compromised or abusive.</li>
            </ul>
          </LegalSection>

          <LegalSection id="role-based-access" title="4. Role-based access">
            <p>
              Access within GetPrio is role-based. Guests can view public vendor information. Customers
              can manage their own profile and bookings. Vendor staff and vendor admins may only use
              the features assigned to their tenant. Platform admins may access governance tools and
              platform records necessary for moderation, support, and compliance.
            </p>
          </LegalSection>

          <LegalSection id="bookings-and-service-use" title="5. Bookings and service use">
            <ul>
              <li>Bookings are subject to vendor availability, operating hours, and service rules.</li>
              <li>Booking details must be accurate, including contact information and selected service.</li>
              <li>Some bookings may require manual payment proof upload and vendor verification.</li>
              <li>Pending bookings may expire if required actions are not completed in time.</li>
              <li>Vendors may reschedule, reject, or cancel bookings according to their policies and platform rules.</li>
            </ul>
          </LegalSection>

          <LegalSection id="payment-and-proof" title="6. Payment and proof handling">
            <p>
              Where GetPrio supports manual payment, you are responsible for sending proof that is
              accurate and legible. Payment references, screenshots, and related records may be
              retained for verification, dispute handling, and audit purposes. GetPrio does not
              guarantee the outcome of external payment transactions.
            </p>
          </LegalSection>

          <LegalSection id="cancellations-and-refunds" title="7. Cancellations and refunds">
            <p>
              Booking cancellation rules depend on the booking status at the time you cancel and on
              who initiates the cancellation. The current policy is designed for booking-only use
              and does not create a platform-managed refund processor.
            </p>
            <ul>
              <li>
                Customers may cancel a booking before check-in while the booking is still pending
                vendor acceptance or confirmation.
              </li>
              <li>
                If a customer cancels after the vendor has already accepted or confirmed the
                booking, any collected payment is forfeited to cover financial losses.
              </li>
              <li>
                Late check-in and no-show bookings are non-refundable.
              </li>
              <li>
                If a vendor cancels before service delivery, the vendor is responsible for issuing
                a full refund of any collected booking payment.
              </li>
              <li>
                Refunds are handled by the vendor, not by GetPrio, and any manual refund timing or
                payment-method details must be confirmed directly with the vendor.
              </li>
              <li>
                If service has already started or if a cancellation involves partial performance,
                the outcome is handled case by case.
              </li>
            </ul>
            <Alert>
              Customers should expect to lose the booking payment once they cancel after vendor
              acceptance or confirmation.
            </Alert>
          </LegalSection>

          <LegalSection id="user-conduct" title="8. User content and conduct">
            <p>
              You agree not to submit unlawful, abusive, misleading, or harmful content. You must not
              attempt to exploit the platform, interfere with other users, upload malware, scrape data
              without permission, or bypass access controls.
            </p>
            <ul>
              <li>No harassment, impersonation, fraud, spam, or review manipulation.</li>
              <li>No attempts to tamper with bookings, queue positions, payment records, or staff access.</li>
              <li>No storing or sharing content that violates privacy or intellectual property rights.</li>
            </ul>
          </LegalSection>

          <LegalSection id="vendor-and-staff" title="9. Vendor and staff obligations">
            <p>
              Vendors are responsible for maintaining accurate business information, assigning staff
              appropriately, and handling customer data only for legitimate operational purposes.
              Vendor staff may not use access granted to another person, and vendors are responsible
              for actions taken within their workspace.
            </p>
          </LegalSection>

          <LegalSection id="service-availability" title="10. Service availability">
            <p>
              We aim to keep GetPrio available, but the service may be interrupted for maintenance,
              updates, outages, or events beyond our control. We do not guarantee uninterrupted or
              error-free operation.
            </p>
          </LegalSection>

          <LegalSection id="suspension-and-termination" title="11. Suspension and termination">
            <p>
              We may suspend or terminate access if we believe a user has violated these Terms,
              created a security risk, abused the platform, or otherwise acted in a way that harms
              users, vendors, or the service.
            </p>
          </LegalSection>

          <LegalSection id="intellectual-property" title="12. Intellectual property">
            <p>
              The GetPrio name, logo, interface design, and related content are owned by
              MNK-Labs Software Development Services or its licensors and are protected by
              intellectual property laws. You may not copy, resell, or reuse them without permission,
              except as allowed for normal use of the service.
            </p>
          </LegalSection>

          <LegalSection id="disclaimers" title="13. Disclaimers and limitation of liability">
            <p>
              GetPrio is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the extent allowed by
              law, we disclaim warranties of merchantability, fitness for a particular purpose, and
              non-infringement, and we are not liable for indirect or consequential losses caused by
              service interruptions, third-party actions, or misuse of the platform.
            </p>
          </LegalSection>

          <LegalSection id="changes" title="14. Changes to these terms">
            <p>
              We may update these Terms from time to time. If changes are material, we may display an
              in-app notice or update the last modified date. Continued use of GetPrio after changes
              take effect means you accept the updated Terms.
            </p>
          </LegalSection>

          <LegalSection id="contact" title="15. Contact">
            <p>
              If you have questions about these Terms, contact the GetPrio team through the support
              channels in the app or the public contact page.
            </p>
          </LegalSection>

          <p>
            This page is a generic draft aligned with the GetPrio capstone architecture and is not
            legal advice.
          </p>
        </div>
      </LegalArticleLayout>
    </div>
  );
}
