import { Alert } from "@vendor/components/ui/alert";
import LegalArticleLayout from "./LegalArticleLayout";
import LegalSection from "./LegalSection";

const lastUpdated = "October 1, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="marketing-page policy-page">
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
        <p>
          This Privacy Policy explains how GetPrio collects, uses, stores, shares, and protects
          personal information when you use the GetPrio website, GetPrio Mobile app, queue and
          booking flows, vendor pages, and related services. The information processed depends
          on your role and the features you use.
        </p>

        <div>
          <LegalSection id="who-we-are" title="1. Who we are">
            <p>
              GetPrio is a service marketplace and booking platform that helps guests discover
              vendors, customers make bookings, vendors manage services and queues, and platform
              administrators oversee the system. GetPrio is owned and operated by MNK-Labs
              Software Development Services, which is responsible for the service and the personal
              information described in this policy.
            </p>
          </LegalSection>

          <LegalSection id="information-we-collect" title="2. Information we collect">
            <p>
              We collect information you provide directly, information created during bookings and
              support interactions, and limited technical data needed to operate and secure the
              service.
            </p>
            <ul>
              <li>Account details such as name, email address, phone number, and password hash.</li>
              <li>Profile details, profile photos you upload, preferences, favorite vendors, and booking contact information.</li>
              <li>Queue and booking data such as vendor, service selected, ticket identifiers, position, join and service times, estimated waits, notes, status, and payment reference.</li>
              <li>Payment proof uploads and verification records when manual payment is required.</li>
              <li>Historical campaign records from participation before retirement, including organizer and contributor membership, payment instructions, contribution and reimbursement evidence, reports, review decisions, and audit events. The campaign workflow is no longer available; retained records remain subject to the access limits and purpose-based retention described below.</li>
              <li>Public vendor reviews, including review appeals and moderation decisions. Customers do not receive ratings. Historical customer-rating and private role-scoped trust-rating records may be retained for existing disputes and audit obligations.</li>
              <li>Notification preferences and push registration data linked to your account, including an app installation identifier, notification token, platform, app version, app locale, and delivery success or failure records. Browser notifications use a push subscription endpoint and encryption keys.</li>
              <li>Vendor and staff records such as business names, locations, roles, schedules, and assigned bookings.</li>
              <li>Security and diagnostic data such as login attempts, audit logs, timestamps, IP address, and device metadata.</li>
            </ul>
          </LegalSection>

          <LegalSection id="how-we-use-information" title="3. How we use information">
            <ul>
              <li>To create and manage accounts, authenticate users, and enforce role-based access.</li>
              <li>To process bookings, display vendor profiles and saved favorites, manage queue tickets, and calculate and update estimated waiting times.</li>
              <li>To verify manual payment proof and confirm or reject bookings where needed.</li>
              <li>To send confirmations, reminders, status updates, and service notifications.</li>

              <li>To monitor abuse, troubleshoot issues, and maintain audit trails.</li>
              <li>To improve product performance, usability, and service reliability.</li>
            </ul>
          </LegalSection>

          <LegalSection id="legal-bases" title="4. Legal bases">
            <p>
              We process personal information to provide the services you request, meet applicable
              legal obligations, and pursue legitimate interests such as securing the service and
              preventing abuse, subject to your rights. Where consent is required, we ask for it
              and provide ways to withdraw it. The applicable basis depends on the information,
              purpose, and law, including the Philippine Data Privacy Act of 2012.
            </p>
          </LegalSection>

          <LegalSection id="sharing-and-disclosure" title="5. Sharing and disclosure">
            <p>
              We do not sell personal information. We may share data with:
            </p>
            <ul>
              <li>Vendors and authorized vendor staff for bookings, service delivery, and queue management.</li>
              <li>Service providers that host the service, store files, process payments, or deliver email and push notifications.</li>
              <li>Platform administrators who manage moderation, disputes, security, and compliance.</li>
              <li>Authorities when disclosure is required by law or necessary to protect rights and safety.</li>
            </ul>
            <p>
              GetPrio Mobile uses Google Firebase Cloud Messaging and, on Apple devices, Apple
              Push Notification service to deliver notifications. These providers process app
              installation identifiers, notification tokens, message payloads, and technical
              information needed to operate their services. See the{" "}
              <a href="https://firebase.google.com/support/privacy">Firebase privacy information</a>.
              Service providers may process information outside your country.
            </p>
            <p>
              Vendor profiles and reviews submitted for public display can be seen by other users.
              When checkout opens a payment provider’s website, information you enter there is
              handled under that provider’s privacy policy. GetPrio receives the transaction
              information needed to associate payments with your queue or booking.
            </p>
            <p>Payment evidence and private account records are accessible only to authorized participants and staff with an operational, dispute, or audit need. Campaign payment instructions and evidence are limited to the organizer and the relevant contributor. Vendors and public viewers do not receive campaign payment references, proof files, contributor identities, reimbursement records, or private trust-rating notes. Platform Admin access is case-scoped to a report, dispute, or audit need.</p>
          </LegalSection>

          <LegalSection id="retention" title="6. Retention">
            <p>
              We keep personal data only as long as needed for the purpose it was collected, to
              complete bookings, maintain business records, resolve disputes, meet legal obligations,
              and support system security. Some audit logs and transactional records may be retained
              longer for compliance and fraud prevention.
            </p>
            <p>Historical records, review disputes, and audit records follow a documented purpose-based retention schedule and are deleted or de-identified when no longer needed for an active booking, complaint, legal obligation, security investigation, or data-subject request. Production launch requires that schedule and storage deletion process to be approved in the Privacy Impact Assessment.</p>
            <p>Retention varies by record type and purpose; there is no single deletion period for all records. Contact us to request deletion or information about retention of your records. Turning off notification permission or uninstalling the app does not itself delete your account, transaction history, or server-side notification registration records.</p>
          </LegalSection>

          <LegalSection id="security" title="7. Security">
            <p>
              GetPrio uses role-based access control, secure session handling, transport encryption,
              private storage for payment proof, and audit logging to reduce unauthorized access,
              tampering, and leakage. No online system is completely secure, so we also review access
              patterns and limit privileged data exposure where possible.
            </p>
            <p>Notification messages, including future silent push notifications, contain only the minimum event context and never include payment instructions, proof images, payment references, private notes, or bank details.</p>
            <p>Queue notifications may include a service or vendor name, ticket identifier, and status information. Depending on your device settings, notifications may be visible on your lock screen. You can hide previews or disable notifications in your device settings.</p>
          </LegalSection>

          <LegalSection id="choices-and-rights" title="8. Your choices and rights">
            <p>
              Depending on your role and applicable law, you may request access, correction,
              restriction, or deletion of certain personal data. Some records cannot be deleted
              immediately if they are needed for bookings, legal compliance, or legitimate business
              records.
            </p>
            <p>
              You can update available profile and notification settings in your account. For
              access, correction, or deletion requests, use our{" "}
              <a href="/contact">contact page</a> and identify the account concerned.
              We may need to verify your identity before acting on a request. Please do not send
              your password or authentication codes. Removing the app does not close your account.
            </p>
            <p>
              Where Delete account is available in Profile &gt; Security, you can confirm deletion
              directly in the app. When we accept your verified request, account access stops and
              waiting queue tickets, including pending carry-over tickets, are cancelled. Tickets
              already called for service remain with the vendor. We provide a request reference and
              a deadline within 30 days, then notify you when deletion is complete. Only records
              with a documented retention basis may remain, with the applicable reason and period
              explained in the completion notice. Deletion does not automatically refund payments
              or cancel bookings with a vendor.
            </p>
            <p>
              Camera access supports QR scanning; photo access lets you
              choose an image to upload. QR scanning reads codes on your device; the scanned queue
              identifier is used to retrieve queue details. A selected profile image is uploaded
              when you submit it. Biometric sign-in uses your device’s authentication service;
              GetPrio does not receive your fingerprint or face template. You can manage camera,
              photo, and notification permissions in device settings, and biometric sign-in in the
              app’s security settings.
            </p>
          </LegalSection>

          <LegalSection id="cookies" title="9. Cookies and similar technologies">
            <p>
              The website uses cookies and browser storage for sign-in, preferences, and queue access
              details. On a shared device, sign out and clear browser data when appropriate. The
              mobile app uses local storage for preferences and secure device storage for
              authentication credentials. Clearing storage may sign you out or reset preferences.
            </p>
          </LegalSection>

          <LegalSection id="children" title="10. Children">
            <p>
              GetPrio is not intended for children to create accounts or make bookings without
              appropriate supervision or authorization from a parent or guardian where required by
              law.
            </p>
          </LegalSection>

          <LegalSection id="contact" title="11. Contact us">
            <p>
              If you have questions about this policy or your personal data, contact the GetPrio team
              through our <a href="/contact">contact page</a>. State that your request
              concerns privacy and describe what you need so we can route it appropriately.
            </p>
          </LegalSection>

          <p>
            We may update this policy as our services or privacy practices change. The date above
            identifies the latest revision. We will provide additional notice where required.
          </p>
        </div>
      </LegalArticleLayout>
    </div>
  );
}
