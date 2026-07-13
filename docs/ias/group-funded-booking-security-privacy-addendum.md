# Group-Funded Booking IAS Addendum

Date: 2026-07-12

This addendum updates the GetPrio IAS deliverables for the group-funded booking feature. It should be read with `docs/plan/capstone-ias-security-privacy-prd.md` and `docs/plan/capstone-route-role-inventory.md`.

## Module 2 Privacy Inventory Additions

| Data Field / Record | Data Type | PI/SPI Classification | Purpose | Retention / Access Rule |
| --- | --- | --- | --- | --- |
| Group-funded campaign public token | Transactional identifier | PI-adjacent when linked to organizer | Shareable campaign detail URL | Keep with campaign record; public token exposes only minimized public payload. |
| Campaign visibility and description | User-generated public metadata | PI-adjacent public content when public | Explain the campaign on vendor profile/detail pages | 280-character limit, backend moderation, escaped rendering, report-abuse path. |
| Organizer display label | Account-derived display text | PI when linked to account | Public trust/context for campaign | Mask on public payloads; full account linkage remains private. |
| Participant record | Transactional ownership data | PI | Track who joined and who owns a contribution/refund | Visible only to the participant, authorized vendor users, and platform governance. |
| Contribution amount/status/reference | Payment transaction data | PI-adjacent transactional data | Exact-share ledger and vendor payment review | Contributor sees own contribution; authorized vendor users review proof; public sees only verified aggregates. |
| Contribution proof metadata/evidence | Sensitive transactional evidence | Sensitive PI-adjacent evidence | Manual payment verification and dispute support | Never public; route- and role-scoped to owner, authorized vendor users, and platform governance. |
| Refund obligation/evidence | Sensitive transactional evidence | Sensitive PI-adjacent evidence | Manual refund tracking after failure/rejection/cancellation | Contributor sees own refund state; vendor handles evidence; public payload excludes it. |
| Capacity hold | Operational booking data | Non-public operational data | Reserve slot during vendor review after full funding | Internal/vendor only until linked booking is created. |
| Group-funded event timeline | Audit/transactional data | System/security data | Accountability for campaign, contribution, review, and refund transitions | Internal/vendor/customer-redacted views only; platform governance for moderation and disputes. |

Legal basis under RA 10173 remains contract performance for booking/payment operations, legitimate interest for fraud prevention and security monitoring, and consent/organizer choice for public campaign description/visibility.

## Module 3 Access Control Notes

| Actor | Allowed Group-Funded Actions | Denied / Limited Actions |
| --- | --- | --- |
| Guest | View vendor-profile public campaign cards and public campaign detail; report abuse. | Create campaigns, contribute, view proof/refunds/participants. |
| Customer organizer | Create campaign, choose visibility, cancel pre-funded campaign, accept/decline replacement slot, view own campaign state. | View other contributors' payment proof/reference/refund evidence. |
| Customer contributor | Submit exact contribution proof and view own contribution/refund state. | Edit campaign terms, approve vendor actions, view other contributors. |
| Vendor Staff | Currently denied group-funded vendor review routes because they require `tenant.booking.manage`. | Manage settings, verify/reject proof, approve/reject campaigns, update refunds unless permissions are intentionally broadened later. |
| Vendor Admin / Owner | Configure branch-service eligibility, review contributions, approve/reject funded campaigns, propose replacement slots, update manual refunds. | Access other tenants' campaigns. |
| Platform Admin | Governance/moderation/audit review when platform routes are added. | Does not bypass tenant booking routes without explicit platform workflow and audit. |

Session controls remain the same as the capstone auth design: authenticated state-changing requests require a valid access token; production cookie transport must use HttpOnly, Secure, SameSite cookies plus CSRF protection.

## Module 4 Attack Surface Additions

| Endpoint / Form | Likely OWASP Risk | Severity | Evidence Placeholder | Remediation / Implemented Control |
| --- | --- | --- | --- | --- |
| `POST /api/account/group-funded-campaigns` campaign creation form | Stored XSS, abuse/spam, parameter tampering | High | Backend validation/unit test output | Server validates service/location eligibility, contributor/deadline bounds, 280-character description, and moderation. |
| `POST /api/account/group-funded-campaigns/:token/contributions/payment-proof` | Broken access control, unsafe upload metadata, payment tampering | High | Service tests for proof metadata and ledger state | Auth required, one contribution per user/campaign, exact amount derived server-side, proof metadata type/size validation. |
| Vendor contribution verify/reject routes | Broken access control, ledger tampering | High | RBAC and lifecycle test output | `tenant.booking.manage` required; ledger recomputation is transactional; event records capture actor and transition. |
| Vendor campaign approve/reject/review-expiry routes | Capacity race, refund integrity failure | High | Lifecycle tests for linked booking/refunds | Capacity is rechecked, dedicated capacity holds are used, approval creates one paid linked booking, rejection/expiry creates refund obligations. |
| Vendor refund update route | Refund fraud, repudiation | High | Manual refund test output | Refund records are separate from campaign status, vendor actor is stored, contribution status is updated, event is recorded. |
| `GET /api/public/vendors/:tenantSlug/locations/:locationSlug/group-funded-campaigns` | Excessive data exposure, private-link leak | Medium | Repository public-discovery test output | SQL filters `visibility = 'public'` and branch-service `allow_public_campaigns`; public DTO allowlists fields. |
| `GET /api/public/group-funded-campaigns/:publicToken` | IDOR / excessive data exposure | Medium | Public payload test output | Public formatter masks organizer identity and excludes organizer user ID, proof, participant, refund, event, and linked booking details. |
| `POST /api/public/group-funded-campaigns/:token/report-abuse` | Abuse flooding, log injection | Medium | Route limiter and event test output | Express rate limiter, backend moderation for reason text, internal `abuse_reported` event with hashed IP. |

## Verification Evidence

- `backend/tests/groupFundedBookingService.test.cjs` covers creation, moderation, contribution proof submission, verification, funding completion, vendor approval, vendor rejection, missed deadline refunds, customer self-state privacy, replacement slot acceptance, manual refund completion, and abuse-report event recording.
- `backend/tests/groupFundedBookingsRepository.test.cjs` covers schema/repository separation, public discovery filtering, capacity holds, and refund updates.
- `backend/tests/rbac.test.cjs` asserts Vendor Staff lacks `tenant.booking.manage`, Vendor Admin/Owner are tenant-scoped, and Platform Admin does not implicitly bypass tenant booking permissions.
- `scripts/smoke-test.mjs --stage group-funded` provides opt-in private lifecycle smoke coverage without depending on public discovery.

## Residual Risks

- Manual payment proof and manual refund evidence still depend on vendor review quality. Production should add stronger object-storage signing, malware scanning, and platform moderation queues.
- Platform Admin group-funded moderation routes are documented but not yet implemented as a dedicated UI/API surface.
- Automated smoke approval requires a prepared service whose group-funded settings allow the configured contributor count; otherwise the smoke stage skips before mutating state.
