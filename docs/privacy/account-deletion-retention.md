# GetPrio account deletion and retention schedule

Owner-approved implementation targets — September 7, 2026. Approval recorded in the implementation conversation. Production controls still require verification; this document is not a claim of deployed compliance.

## Scope and principle

Apply to GetPrio customer accounts across web and mobile, including associated uploads and third-party processing. Delete personal data when it is no longer needed; retain only specifically identified records with a documented purpose, lawful basis, expiry or review date, and restricted access. A retained accounting record must not keep an entire customer profile active.

The deadlines below are approved implementation targets, not deadlines prescribed by Apple or the Philippine Data Privacy Act. Confirm that hosting, backup and supplier configurations can meet them before publishing them.

## Approved implementation schedule

| Data | Treatment |
| --- | --- |
| Sessions, refresh tokens, biometric session material, push registrations | Revoke access and stop account notifications when a verified request is accepted. Clear device credentials. Queue deletion of supplier installation data where supported. |
| Profile name, username, email, phone, avatar, preferences, favorites, reviews and other non-required user content | Remove public visibility when the request is accepted. Permanently erase from active systems within 30 days, including old avatar objects and file versions under GetPrio's control. Keep a restricted completion-contact address only until the completion notice is sent. |
| Queue and booking history | Remove unnecessary identifying fields, notes, and links within 30 days. Keep only genuinely anonymous operational totals or specific records covered by a retention exception. Removing a user ID alone does not anonymize a row containing a name, phone, email, or identifying payload. |
| Ordinary security and notification-delivery logs | Maximum target 90 days from the event; erase sooner when no longer needed. Document which minimal fields are needed to investigate abuse. Passwords, tokens, and message contents must not be logged. |
| Required accounting source documents | Retain only records within the applicable accounting obligation. Philippine BIR RR 7-2024 section 4 generally specifies five years for books and other accounting records, calculated from the prescribed tax-return deadline/actual late filing date for the relevant year, not simply five years after deletion. Confirm with the accountant which GetPrio records qualify and whether another requirement extends retention. Do not apply this period to all customer data. |
| Active disputes, chargebacks, legal claims or preservation orders | Retain only evidence necessary for the specific matter. Record the basis, responsible owner and next review date; review at least every 90 days as an operational rule. Erase when the basis expires unless a separate documented obligation applies. Unrelated profile data must still be deleted. |
| Backups | Target: expire GetPrio-controlled backup copies within 35 days after active-system erasure. Restrict backup use to recovery; replay deletion records before a restored system serves traffic. Validate provider capabilities first. External supplier retention is separately documented, not covered by this target. |
| Deletion audit | Keep a minimal request reference, policy version, dates and outcome for 12 months after completion to demonstrate fulfilment, then erase. Avoid retaining the deleted profile, password, full email, or unnecessary identifiers in this audit. |

## Required implementation

1. Put Delete account at the bottom of Profile > Security. Explain permanent loss, the processing deadline, limited retention exceptions, and that deletion does not automatically refund payments or cancel vendor services.
2. Reauthenticate using the current password for password accounts, with server-side verification and rate limiting. Accounts without a password need equivalent provider reauthentication; they must not be forced to create a password solely to delete. Revoke Sign in with Apple tokens where applicable.
3. Accept the request in the app without making the user call or email support. Save a durable, idempotent request before revoking access. Return `accepted`/`processing` until erasure completes; never return `deleted: true` merely because sessions were revoked.
4. Use a retryable worker for database cleanup, object storage, caches and supplier deletion. Inventory copied personal data in event payloads, OTP records, payment metadata, reviews, support records, queue and booking contact fields. Track failed work and alert the operator before the deadline.
5. Retention exceptions are explicit records with reasons and expiry/review dates, not an unrestricted archive of the account. Separate them from product access, marketing, analytics, and ordinary vendor browsing.
6. Resolve active queue attendance, bookings and financial obligations without silently retaining the whole account or automatically destroying another party's records. Explain any outstanding obligation independently of account access.
7. Send an acknowledgement with the deadline and a completion notice when deletion finishes. State which categories remain, why, and for how long. Show partial failures honestly.
8. Publish the approved policy only after its deadlines and controls are implemented and verified. Upload a new mobile build; the existing v1.0.1 build 2 does not include deletion.

## Release checks

Wrong password and missing authentication do not change data; one user cannot delete another; repeated requests do not duplicate work. Pending work survives crashes. Sessions and push stop promptly. Reviews and all avatar versions disappear. Retained records contain only approved fields. Failed supplier deletion is retried. Backup restoration does not resurrect deleted accounts. Passwordless accounts can initiate deletion. A test account completes the real deployed flow before release.

## Sources and limits

- Apple: https://developer.apple.com/support/offering-account-deletion-in-your-app/ — in-app initiation, full account deletion, reauthentication, provider token revocation, and notification of completion; delayed/manual processing is permitted when its timeframe is disclosed.
- Philippine Data Privacy Act: https://privacy.gov.ph/data-privacy-act/ — sections 11(e)-(f), purpose-limited retention and identification.
- NPC implementing rules: https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/ — retention and secure disposal requirements.
- BIR RR 7-2024: https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf — section 4 accounting retention. Applicability must be established for each accounting record; this proposal does not determine every tax or claims obligation.

Owner approved the 30-day erasure, 90-day ordinary logs, 35-day backup expiry and 12-month minimal audit targets. Accounting applicability and supplier/backup capabilities remain release checks. See account-deletion-runbook.md for the implementation and outstanding deployment checks.
