# Legacy migration, RBAC, and rollout cutline

Type: task
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01, 02, 03, 04

## Question

What additive schema/API/route migration, legacy campaign treatment, RBAC enforcement, test strategy, IAS documentation, and ordered implementation slices safely replace vendor-managed group-funded campaigns with organizer-collected customer controls?

## Known direction

- No campaign-management or contribution-review control belongs in the vendor dashboard.
- Vendor validation is limited to the original booking.
- Customer controls must enforce organizer and contributor scope server-side, protect payment evidence, and retain auditable decisions.

## Resolution

### Cutover strategy

This is a clean replacement, not an in-place legacy migration. Before launch, perform a controlled transactional-data reset that preserves users, vendor accounts, tenant/branch/service catalogs, availability, schedules, and configuration. It removes bookings, campaigns, contributions, reimbursement/refund records, queue tickets, capacity holds, payment-evidence objects, and dependent operational notifications/audit records. No active legacy campaign, proof, balance, or refund state survives the reset.

### Schema and API boundary

1. Replace the funding-first campaign relationship with an optional organizer-collected campaign attached to an already-paid, `confirmed` normal booking or Service Bundle. Keep booking payment evidence separate from contributor and reimbursement evidence.
2. Add campaign state, contribution proof/review, reimbursement confirmation/dispute, report/freeze, notification-preference, rating, rating-revision, and rating-dispute records as append-only/auditable state transitions where decisions affect money, trust, or access.
3. Create customer-account endpoints for campaign draft/create, publish, manage, share, organizer proof review, contributor reimbursement confirmation/refusal, scoped evidence access, reports, and rating actions. Public preview is privacy-minimized; any join, payment instruction, proof, rating, or report action requires authentication.
4. Delete the legacy vendor campaign dashboard UI and retire every vendor campaign, contribution-proof, contribution-review, refund, capacity-hold, replacement-slot, and vendor-campaign notification route/permission. Vendor users retain normal booking validation, scheduling, cancellation, and service operations only.

### Server-enforced RBAC

- **Organizer customer:** creates and manages only campaigns attached to their own confirmed bookings; reviews submitted proofs; records reimbursement; sees the private roster and scoped evidence.
- **Contributor customer:** sees only their own contribution/reimbursement evidence and state; submits one proof per permitted attempt; confirms or disputes only their own reimbursement; never accesses the organizer console.
- **Other signed-in customer:** may see only privacy-minimized opt-in public campaigns or a valid share-link preview, and must authenticate before any action.
- **Vendor Admin/Staff:** validates only the normal booking. They cannot list, inspect, decide, refund, or receive notifications about campaigns or contribution evidence.
- **Platform Admin:** handles reported/frozen cases and logged, time-limited evidence access; no ordinary payment-verification authority or automatic reimbursement completion in v1.

### Ordered implementation slices

1. **Reset and schema foundation:** back up/verify the intended environment, delete only the agreed transaction scope and dependent evidence objects, apply the clean campaign/rating schema, and seed a verified fixture set.
2. **Normal booking handoff:** add the booking-flow opt-in, retain normal manual booking payment and vendor confirmation, and unlock private campaign drafts only after `confirmed`.
3. **Customer campaign backend:** implement campaign lifecycle, organizer controls, contributor proof/review, reimbursement confirmation/dispute, scope checks, audit events, and preferred-channel/in-app notifications.
4. **Customer mobile UI:** implement Campaigns account navigation, booking-detail entry/prompt, mobile Control Center hero and roster, share-link preview, signed-in public discovery, and contributor/reimbursement views.
5. **Ratings and platform moderation:** implement public vendor reviews, private trust summaries, revisions, disputes, reports, freezes, and the Platform Admin case surface.
6. **Retirement and hardening:** remove legacy vendor/public group-funded routes, types, UI, stream events, capacity-hold jobs, and evidence paths; update all consumers and permission tests.
7. **Release gate:** run migration/reset verification, schema checks, unit/integration/RBAC/IDOR tests, state-machine and notification-preference tests, mobile accessibility checks, smoke tests, and IAS security/privacy documentation updates.

### IAS documentation gate

Update the security requirements, PIA, access-control design, and predicted vulnerability report to trace the new customer campaign controls, role-scoped evidence, refund confirmation, ratings, report/freeze path, notification preference, and removal of vendor financial-data access. Legal/compliance findings from **Philippine legal and compliance boundary** are a release blocker for this gate.

## Resolution comment

Resolved as a reset-based clean replacement with no legacy transaction migration. This ticket defines the implementation cutline only; it does not authorize the destructive reset, schema changes, or production rollout.
