# Shared GetPrio email design

## Scope and acceptance criteria

Apply the approved 9 September 2026 email mockups to all existing backend email sends, including requests initiated by Flutter. Preserve recipients, subjects, original plain-text messages, delivery provider selection, preferences, allowances, OTP generation/expiry/verification and notification triggers.

Use the official proportion-preserving logo, #FD8501 / #EA6A1F accents, #282729 charcoal actions, #FFFAF4 outer canvas, white 600px container, #3F3027 text and #EADCCF borders. Use readable 16px sans-serif body text, centered branding, left-aligned headings, rounded panels and full-width pill actions. Optional modules disappear completely. Mobile uses 24px padding with stacked details; wider screens use 48px padding and aligned detail columns. Essential information stays live text.

Bundle the approved five wide 1200 × 600 PNG illustrations and five transparent 600 × 400 compact variants as versioned public assets. Use compact illustrations in transactional templates, welcome/announcement heroes only when explicitly selected. Keep the official logo separate. No navigation, social icons or heavy shadows.

## Implementation

- `backend/src/services/emailTemplates.js` renders the shared HTML and plain-text alternatives. It owns brand tokens, escaped paragraphs, optional subtitle/greeting, structured inline links, detail rows, code with expiry, queue number/status, illustrations, attachment image, primary/secondary actions, sign-off and footer. Only HTTP(S) URLs are accepted. Structured inline paragraphs can be passed as `message: [["Read ", { text: "the guide", url: "https://getprio.online/..." }, "."]]`; raw HTML is not accepted as message content.
- `notificationService.sendEmail` adds shared HTML when a sender has not supplied a fully rendered email. `emailTemplate` holds optional presentation fields. The existing plain-text body is sent unchanged alongside HTML through Resend, SendGrid and SMTP. This also covers security/deletion/campaign/operational messages without separate templates.
- `queueEmailTemplates.js` keeps the existing lifecycle copy, private ticket links and codes while using the shared renderer. Queue OTP now uses its dedicated live code module and does not put the code in the preheader.
- `bookingEmailTemplates.js` reads actual booking fields and the venue timezone. Missing values are omitted. Guest bookings do not link to account-owned booking routes. Pending or canceled bookings do not use celebratory confirmation artwork.
- The campaign report retains its inline screenshot, filename alt text and screenshot action within the shared shell.

## Audited send coverage

| Existing email | Origin / backend entry | Result |
| --- | --- | --- |
| Customer registration code and resend | Flutter `auth_repository.dart` → `/api/auth/register/customer/otp` and `/resend` → customerRegistrationOtpService | Shared shell, verification illustration, code and 10-minute expiry |
| Queue join code and resend | Flutter `join_repository.dart` → `/api/mobile/queue-join/otp/*`; web queue joins → queueJoinOtpService / outbox | Shared verification design, existing queue OTP expiry |
| Current/new email verification | Flutter `profile_repository.dart` → `/api/account/email-change/*` → emailChangeService | Shared code panel and context-specific security instructions |
| Phone-change verification | `/api/account/phone-change/*` → phoneChangeService | Shared code panel |
| Password reset | Flutter `auth_repository.dart` → `/api/auth/password-reset/request` | Shared security illustration and existing reset-link CTA |
| Email changed, authenticator changed/removed | emailChangeService / mfaFlowService; mobile and web security actions | Shared generic shell; original security message preserved |
| Account deletion acknowledgement/completion | accountDeletionWorker; mobile and web account requests | Shared generic shell; original retention and deadline message preserved |
| Booking verification | bookingOtpService | Shared code panel and existing booking expiry |
| Booking submitted, payment rejected, customer cancellation, no-show | bookingService | Shared details panel and account CTA where the booking has an account owner |
| Queue joined, near-turn, called, exception, carry-over, final outcomes | notificationService / queueNotificationOutboxDispatcher | Shared queue illustration, number/status panel and private status link |
| Queue reconciliation | queueEmailTemplates / outbox | Shared details and dashboard action |
| Campaign participant updates | organizerCampaignService | Shared generic shell |
| Campaign report | groupFundedBookingService | Shared details, inline screenshot and screenshot action |
| Allowance warning and enterprise inquiry | allowanceWarningService / publicRoutes | Shared generic shell |

All production email calls found in `backend/src` use notificationService. No Flutter changes or new mobile binary are needed to change these server-rendered emails.

## Existing trigger gaps, deliberately unchanged

Vendor booking confirmation/cancellation, payment approval, rescheduling and check-in reminders currently use push notifications rather than an email send. This design change does not add send events or change opt-in behavior. Announcement and booking-confirmation/reminder designs are available through the renderer and fixtures; no new marketing campaign or reminder scheduler was introduced.

## Assets and deployment

`frontend/public/email/v1/` contains the approved art and original logo. The renderer derives absolute asset and action URLs from the existing `APP_BASE_URL`. Deploy the frontend assets before or alongside the backend. Verify `/email/v1/getprio-logo.png` and the compact PNGs return image/png on that configured public origin. Preserve `/email/v1/` after later designs are released, since previously delivered emails reference those immutable paths.

Transactional examples omit preferences/unsubscribe links. The shared renderer supports explicit `preferencesUrl` and `unsubscribeUrl` for applicable future campaigns; it does not invent destinations or subscription rules.

## Local preview and verification

Run `APP_BASE_URL=http://127.0.0.1:4179 node scripts/preview-emails.cjs`, then `python3 -m http.server 4179 --bind 127.0.0.1 --directory .scratch/email-preview`. Open the local index. These fictional fixtures do not invoke the sender or any email provider. Confirmation/reminder previews are design fixtures, not enabled notification events. Welcome sends are documented in `signup-welcome-emails.md`.

Verified in Chrome at 320px, 390px, 768px and 1280px, including long booking values, loaded logo/artwork and no horizontal overflow. Email provider payload tests cover Resend, SendGrid and SMTP without transmitting messages. Template tests cover escaping, unsafe links, omitted sections, inline links, zero values, OTP text/expiry, queue information, asset dimensions and booking timezone/ownership behavior.

Backend typecheck, changed-source lint and frontend production build pass; all 12 versioned email assets are present in the build. Initial full backend run: 508 passed, four skipped, one failed because the local PostgreSQL concurrency test could not authenticate as `prio`. The final isolated email/service run passed 106 tests. Review found and corrected a queue plain-text compatibility change; exact original queue OTP and joined-message text now have regression coverage. Standards and specification reviews have no unresolved findings. Actual Gmail, Outlook and Apple Mail inbox rendering and deployed asset delivery remain release checks. Outlook may show square corners; the table-based button and essential text remain usable.
