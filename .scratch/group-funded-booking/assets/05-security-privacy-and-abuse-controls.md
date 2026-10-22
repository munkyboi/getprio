# Group-Funded Booking Security, Privacy, And Abuse Controls

## Scope

This research resolves the wayfinder ticket `Group-funded booking security/privacy/abuse controls`. It maps the settled lifecycle, data model, customer experience, and vendor operations decisions to concrete privacy, RBAC, audit, payment-integrity, refund-integrity, anti-abuse, and OWASP-facing controls.

Local sources used:

- `AGENTS.md` capstone security/privacy requirements supplied in the thread.
- `docs/plan/capstone-ias-security-privacy-prd.md`
- `docs/plan/capstone-role-based-hci-screens-prd.md`
- `docs/plan/capstone-route-role-inventory.md`
- `docs/plan/booking-queue-mvp-prd.md`
- `docs/adr/0002-private-payment-proof-storage.md`
- Existing booking/payment proof code in `backend/src/services/bookingService.js`, `backend/src/services/paymentProofStorageService.js`, `backend/src/routes/accountRoutes.js`, and `backend/src/routes/vendorRoutes.js`.
- Resolved group-funded wayfinder tickets `01`, `02`, `03`, and `04`.

## Control Principles

Group-funded booking creates a public/private boundary that normal single-payer booking does not have. The platform must treat public campaign discovery, contributor funding, proof upload, vendor verification, and refund handling as separate surfaces.

Baseline principles:

- Public views show campaign metadata only.
- Contribution and refund details are private records.
- Payment proof is private evidence, not public media.
- Funding progress uses verified aggregate amounts, not raw contributor details.
- Contributor ownership is individual; organizer control does not grant access to contributor proof images.
- Vendor authority is tenant/location scoped and permission checked server-side.
- Platform admin access is for governance, moderation, dispute, audit, and compliance.

## Public Data Boundary

Public campaign cards and public campaign detail pages may show:

- Vendor name.
- Branch/location name.
- Service name.
- Selected schedule.
- Required contribution amount.
- Target amount or verified funding progress.
- Deadline.
- Masked organizer identity, such as first name plus last initial, or a generic organizer label.
- Organizer description, max 280 characters, after moderation checks.
- Safe campaign state such as `Funding open`, `Funding complete`, `Expired`, or `Vendor review`.

Public views must not show:

- Organizer phone, email, full legal name, or account identifiers.
- Contributor list.
- Contributor contact details.
- Payment references.
- Payment proof object keys, file names, URLs, or previews.
- Refund evidence.
- Internal vendor notes.
- Audit/event detail beyond safe status labels.

## RBAC Matrix

| Actor | Allowed | Not Allowed |
| --- | --- | --- |
| Guest | View public campaigns and safe public campaign details. | Join, upload proof, view participant list, view proof/refund data. |
| Customer organizer | Create campaign, choose visibility, edit description before locked state, share link, cancel before full funding with anti-dark confirmation, view aggregate refund progress. | View other contributors' payment proof/reference/refund evidence, approve vendor actions, edit immutable funding terms after paid contributions. |
| Customer contributor | Join eligible campaign, submit own contribution proof, view own contribution/refund state. | View other contributors' private details, edit campaign terms, cancel the campaign, withdraw paid share in v1. |
| Vendor Staff | View/manage campaigns only if tenant/location permission allows booking/payment operations. Review assigned or permitted payment/refund evidence. | Manage service-level group-funded settings unless granted admin permission; access unrelated tenant/location campaigns. |
| Vendor Admin | Configure eligibility/settings, review fully funded campaigns, verify/reject contributions, propose replacement slots, approve/reject campaigns, manage vendor-side refunds. | Access other vendors' campaigns or override platform moderation. |
| Platform Admin | Inspect moderation, disputes, audit, user/campaign abuse, and compliance data. | Participate as vendor/customer without normal role context; bypass audit. |

## Payment Integrity

Contribution payment must be ledger-driven:

- Each contribution has exactly one required amount in v1.
- No partial payments, overfunding, tipping, or uneven shares in v1.
- Submitted proof is `submitted` or `pending_review`; it does not count toward funding.
- Only vendor-verified contributions count toward `funded_amount_cents` and `paid_participant_count`.
- Aggregate campaign fields must be updated transactionally from contribution records.
- Verification/rejection must record actor, timestamp, reason where rejected, and event timeline entry.
- Proof uploads must validate type and size, normalize filenames, create object keys scoped to campaign/contribution, and reject object keys that do not belong to that contribution.
- Signed proof access should be short-lived and route-protected like existing booking payment proof access.

## Refund Integrity

Refunds remain manual vendor obligations in v1, but must be represented explicitly:

- Refund obligations are separate records linked to contributions.
- Refund records store reason, status, vendor actor, timestamps, notes, evidence metadata, and completion state.
- Campaign status may trigger refund-obligation creation, but refund history must not live only on campaign status.
- Vendor rejection, funding deadline failure, organizer cancellation before full funding, vendor review hold expiry, and vendor cancellation before service delivery make verified contributions refund-eligible.
- Organizer/customer no-show or customer-side cancellation after vendor approval should mark refunds as `policy_review_required`, not automatically refundable.
- Refund completion should require explicit vendor action and should be audit/event logged.

## Moderation And Abuse Controls

Organizer descriptions are user-generated public content. V1 should require:

- Max 280 characters enforced server-side and client-side.
- Profanity/abuse check before save/publication.
- HTML escaping or sanitized rendering to prevent stored XSS.
- Report-abuse action on public campaign pages.
- Admin/moderation visibility for reported campaigns.
- Ability to hide a public campaign from public discovery without deleting contribution/refund history.
- Rate limits for public campaign creation, description edits, public campaign lookups, join attempts, proof uploads, proof view access, report-abuse submissions, vendor proof verification/rejection, and refund updates.

V1 does not need a human pre-publication review queue for every public description. Use inline profanity/moderation checks plus report/flag workflows. If a campaign is reported or trips a high-risk moderation rule, hide or hold public visibility until platform review.

## Audit And Event Logging

Use two layers:

- Domain timeline for customer/vendor-visible campaign history.
- Security/admin audit log for sensitive or governance actions.

Domain timeline should include:

- Campaign created.
- Visibility changed.
- Description changed.
- Contribution submitted.
- Contribution verified.
- Contribution rejected.
- Funding completed.
- Capacity hold created.
- Hold expired.
- Vendor approved.
- Vendor rejected.
- Replacement slot proposed.
- Replacement slot accepted.
- Replacement slot declined.
- Organizer canceled.
- Linked booking created.
- Refund obligation created.
- Refund marked in progress.
- Refund marked completed.

Security/admin audit should include:

- Unauthorized access attempts where practical.
- Vendor/staff proof access.
- Vendor contribution verification/rejection.
- Refund evidence access/update.
- Platform moderation actions.
- Public campaign hide/unhide.
- Suspicious repeated contribution attempts.

## OWASP Attack Surface Map

| Surface | Main Risks | Controls |
| --- | --- | --- |
| Public `Group-funded` tab | Excessive data exposure, scraping, stored XSS | Public DTO allowlist, masked identity, no proof/refund fields, escaped descriptions, rate limiting. |
| Campaign detail public view | IDOR, excessive data exposure | Public token lookup, safe public payload, no private participant data. |
| Campaign creation/edit | Injection, stored XSS, abuse/spam | Server validation, 280-char limit, profanity check, sanitized output, auth required, rate limiting. |
| Join/contribute | Broken access control, fake participation, spam | Customer auth required, one active contribution per account/campaign unless explicitly allowed, rate limiting, audit events. |
| Contribution proof upload | Unsafe upload, object-key tampering, malware-like payloads, privacy leak | Image-only content types, 8 MB or stricter limit, private bucket, scoped object keys, short signed URLs, authenticated upload route. |
| Vendor contribution verification | Broken access control, payment tampering | Tenant/location permission checks, actor/timestamp audit, transactional ledger updates, idempotent transitions. |
| Refund updates | Refund fraud, repudiation | Separate refund records, required reason/status, actor/timestamp, proof/evidence privacy, audit events. |
| Replacement slot | Capacity race, unauthorized reschedule | Re-check availability, dedicated hold, organizer acceptance, event log. |
| Organizer cancellation | Dark pattern, repudiation, refund confusion | Anti-dark confirmation, non-destructive default, clear refund consequence, event/audit log. |
| Platform moderation | Privilege escalation | Platform permission checks, moderation audit log, immutable contribution/refund history. |

## Privacy Data Inventory Additions

Add these to IAS Module 2/data inventory:

| Data | Classification | Purpose | Visibility |
| --- | --- | --- | --- |
| Campaign visibility and description | PI-adjacent public content when public | Campaign discovery and invitation context | Public only if organizer chooses public; sanitized/moderated. |
| Organizer display label | PI when linkable to account | Public trust/context | Masked on public views. |
| Participant record | PI | Contribution ownership and refund tracking | Participant, authorized vendor users, platform admin. |
| Contribution amount/status/reference | Transactional data, PI-adjacent | Funding ledger and payment review | Contributor, authorized vendor users, platform admin. |
| Contribution proof image | Sensitive transactional evidence | Vendor payment verification/dispute support | Contributor, authorized vendor users, platform admin only. |
| Refund record/evidence | Sensitive transactional evidence | Manual refund obligation tracking | Contributor for own refund, authorized vendor users, platform admin. |
| Campaign event timeline | Transactional/audit data | Customer/vendor history | Redacted by actor/role. |
| Security/moderation audit logs | System/security data | Accountability, abuse prevention, compliance | Platform admin and internal governance only. |

## Testing Checklist

Implementation should include tests for:

- Public campaign payload excludes private organizer/contributor/payment/refund fields.
- Private campaigns do not appear in vendor-profile `Group-funded` tab.
- Guests cannot join, upload proof, or view contribution/refund data.
- Contributors can see only their own contribution and refund data.
- Organizer cannot see contributor proof images or payment references.
- Vendor staff access is denied without booking/payment permission.
- Vendor access is tenant/location scoped.
- Platform admin can inspect governance records through platform permissions only.
- Profanity and 280-character validation are enforced server-side.
- Description output cannot execute script content.
- Contribution proof upload rejects unsupported type, oversized file, and object keys for another contribution.
- Funding totals only count vendor-verified contributions.
- Vendor review/rejection/refund transitions are idempotent where applicable.
- Refund obligations are created for accepted trigger states.
- Rate limits exist for public lookup, create/edit, join, proof upload/access, report abuse, verification/rejection, and refund updates.
