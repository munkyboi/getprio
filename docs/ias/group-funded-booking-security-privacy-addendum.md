# Organizer-Collected Campaign IAS Addendum

Date: 2026-07-19

This replaces the vendor-managed group-funded booking addendum. Campaign money moves directly between a contributor and the customer organizer. GetPrio records the workflow but does not hold, transmit, settle, guarantee, or automatically reimburse contribution money. Qualified Philippine legal, privacy, consumer-protection, and tax review remains a production release gate.

## Module 1 — CIA and IAAA

| Control | Campaign-specific requirement |
| --- | --- |
| Confidentiality | Payment instructions, references, proof, contributor identity, reimbursement evidence, and private trust notes are visible only to the organizer and relevant contributor. Vendor users never receive campaign financial evidence. Platform Admin access is case-scoped and audited. |
| Integrity | Booking eligibility, fixed fee, contributor capacity, proof review, cancellation obligations, and contributor-confirmed reimbursement use server-authorized state transitions and database transactions. Audit events identify actor, role, source, and time. |
| Availability | A campaign cannot block or alter the paid booking when the target or deadline is missed. Deadline/review-overdue processing is retryable, and preferred-channel notifications supplement the in-app source of truth. |
| Identification and authentication | Campaign joins, proof, ratings, reports, and management require an authenticated customer account. Generic share previews disclose only the public profile. |
| Authorization | Organizers manage only campaigns attached to their own eligible bookings; contributors access only their own evidence; vendors retain normal booking operations only; Platform Admin moderation requires explicit permissions. |
| Accountability | Proof decisions, publication, cancellation, reimbursement, reports, freezes, ratings, appeals, and moderation decisions create durable records. |

## Module 2 — Privacy inventory and legal basis

| Record | Classification | Purpose and access | Retention decision |
| --- | --- | --- | --- |
| Campaign title, description, schedule, fee, progress | Public or private-link transactional data | Explain a cost-sharing campaign; public only by organizer opt-in and vendor publication consent | Campaign life plus documented complaint/legal period, then delete or de-identify |
| Organizer and contributor IDs | Personal information | Ownership, slot enforcement, fraud and dispute handling; never listed publicly | Booking/campaign life plus complaint/legal period |
| Payment instructions and reference | Financial/transactional personal data | Direct organizer payment and proof matching; organizer plus relevant contributor only | Shortest period needed for active campaign, reimbursement, and dispute |
| Proof and reimbursement evidence | Sensitive transactional evidence | Proof review and redress; private object storage, short-lived access, case-scoped admin access | Explicit evidence schedule with storage-object deletion |
| Notification preference | Personal information | Send event notices using the customer&apos;s preferred permitted channel | Until changed or account retention ends |
| Vendor review | Public user-generated content | Vendor reputation after completed service | While relevant, subject to revision, appeal, moderation, and erasure/legal exceptions |
| User trust rating and private note | Private personal/profile data | Role-relevant trust aggregate; notes never exposed to decision makers as raw content | Defined rating retention; disputed records excluded from aggregates |
| Events, reports, disputes, moderation | Security/audit personal data | Accountability, abuse response, legal defense | Risk-based audit schedule with restricted privileged access |

Likely bases under RA 10173 must be confirmed in the PIA: contract performance for booking-linked operations, legitimate interest for security/fraud/audit with a balancing test, legal obligation where applicable, and consent or another documented basis for optional public publication and notification channels. Users must receive transparency, purpose, recipients, retention, rights, and complaint contact information.

## Module 3 — RBAC and lifecycle

| Actor | Allowed | Denied |
| --- | --- | --- |
| Guest | Open a privacy-minimized generic share preview | Join, report, view payment instructions/evidence, or see contributor identity |
| Customer organizer | Create from own paid/confirmed opt-in booking; edit draft; publish/unpublish; review proof; cancel; record reimbursement; rate contributor | Occupy a slot; access another organizer&apos;s campaign; change the underlying booking through campaign state |
| Customer contributor | Join an open slot; view own instructions/state; submit one proof plus one corrected proof; confirm/dispute own reimbursement; rate organizer after closure | See roster identities, other evidence, organizer controls, or accept own proof |
| Vendor Staff/Admin | Validate and operate the normal booking; view only role-relevant organizer trust aggregate | Campaign dashboard, contribution proof, collection decisions, reimbursement, or private contributor data |
| Platform Admin | Review reports/appeals; freeze campaigns; resolve/hide disputed ratings under permission and audit | Routine access to evidence without an active case; payment custody or settlement |

The cancellation terminal rule is strict: accepted contributions create reimbursement obligations, and the campaign remains `refund_pending` until every affected contributor explicitly confirms receipt. A refusal creates a dispute. Review becomes `review_overdue` after 48 hours or at deadline and is never silently accepted.

## Module 4 — Attack surface

| Endpoint/action | Main risk | Required/implemented control |
| --- | --- | --- |
| Create/edit/publish campaign | Stored XSS, deceptive solicitation, parameter tampering | Ownership and booking eligibility, length/content validation, deadline bounds, vendor public opt-in, two-public-campaign cap |
| Join campaign | race/overbooking, bot abuse, IDOR | Auth, organizer exclusion, unique membership, row-locked capacity check, account/IP rate limit, honeypot |
| Upload proof/evidence | malware, oversized file, evidence leakage | MIME/size allowlist, private object key, role scope; production malware scanning and signed retrieval remain required |
| Organizer proof review | repudiation, biased or late decision | Organizer-only authorization, required rejection reason, one resubmission, 48-hour overdue state, events and notices |
| Cancellation/reimbursement | partial writes, false refund claim | Transactional obligation creation/state updates, organizer evidence, contributor confirmation/refusal, final cancellation only after all confirmations |
| Public discovery/share preview | excessive disclosure, spam | Allowlisted DTO, signed-in discovery, generic token, no financial/evidence/contact/identity fields, filters, reporting and freeze |
| Ratings | retaliation, review manipulation, arbitrary appeal ID | Qualifying interaction, one 1–5 star rating, low-score reason, participant-only 30-day appeal, disputed exclusion, admin resolution, no automatic blocking |
| Notifications | privacy leakage, channel abuse | Campaign-alert opt-out, preferred permitted channel, minimal payload; no evidence or bank/reference data in email/SMS/push |

## Philippine compliance release blockers

- Obtain counsel&apos;s BSP scope assessment before launch and before adding wallets, escrow, payment initiation/routing, settlement, automated refunds, or transfer-based fees.
- Prohibit investment, lending, profit, interest, ownership, securities, or capital-raising campaigns; obtain SEC advice before any such expansion.
- Complete the campaign PIA, privacy notice, evidence retention/deletion schedule, processor inventory, data-subject workflow, breach response, and privileged-access audit design.
- Confirm Internet Transactions Act and E-Commerce Philippine Trustmark applicability with DTI/qualified counsel; publish campaign disclosures and accessible complaint/redress routes.
- Obtain Philippine tax/accounting advice for organizer-collected amounts and any future GetPrio fee model.
- Treat `docs/research/2026-07-18-organizer-collected-campaign-philippine-compliance.md` as research, not legal advice. Formal written sign-off is required for production.

## Release verification

- Repository/service tests cover eligibility, ownership, proof review, slot capacity, cancellation obligations, contributor confirmation/dispute, ratings, and moderation.
- Permission tests must prove vendor campaign routes are absent and cross-customer campaign/evidence/rating IDs return scoped `404`/`403` responses.
- Migration verification must confirm the new organizer/rating tables and zero legacy transactional state after the separately authorized reset.
- Mobile checks target 320–430 px widths, touch-size controls, keyboard focus, star-input accessible names, readable status text, and no per-slot share action.
