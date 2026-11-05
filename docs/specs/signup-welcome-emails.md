# Signup welcome emails

## Request

Enable welcome emails for vendor and customer signup using the approved shared GetPrio email design, including signups initiated by the mobile app.

## Acceptance criteria

- Customer direct registration sends a customer welcome after successful registration. OTP registration sends after successful verification and account creation, never on OTP start or resend.
- New social customer accounts receive the customer welcome. Existing-account social login/linking does not send another welcome. Social vendor signup waits for workspace onboarding completion.
- Direct vendor registration and authenticated vendor onboarding completion send a vendor welcome for the created workspace, using its name and the owner's email.
- Reuse the official logo, welcome hero, shared renderer, plain-text alternative, and existing delivery provider. Customer action opens `/vendors`; vendor action opens `/dashboard`.
- Copy must not imply that an unverified email is verified or that a vendor has been approved.
- Delivery failures must not change a successful signup response. Do not log recipients or provider errors containing private data.
- Preserve existing authentication, verification, authorization, and CSRF behavior. No production test accounts, bulk backfill, or real test email sends.

## Operational behavior

`welcomeEmailService` makes one best-effort send after the successful registration response or OAuth redirect. It catches delivery errors and logs `[welcome-email-failed]` with the user ID and audience. There is no persistent welcome outbox or automatic retry; a process interruption or provider failure can lose a welcome. No historical accounts are emailed. Social accounts without an email are skipped.

These are server-side sends, so the existing Flutter direct-registration and OTP-verification endpoints are covered without a mobile release. The legacy direct-registration endpoint remains unverified as before; the OTP flow welcomes only after verification.

Vendor deliveries use the existing tenant delivery log with purpose `vendor_welcome`; customer deliveries use purpose `customer_welcome` without a tenant. No marketing campaign, preference change, or new reminder schedule is included.

## Verification

Route tests cover direct customer/vendor signup, OTP start versus completion, vendor onboarding completion, and social new account versus ordinary login/vendor onboarding. Service tests capture provider payloads without sending, including audience copy, CTA, artwork, HTML escaping, missing recipient, and isolated provider failure. Actual inbox delivery is a separate live check.
