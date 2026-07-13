Type: research
Status: resolved
Blocked by: 01, 02, 03

## Question

What privacy, RBAC, audit, payment-integrity, refund-integrity, anti-abuse, and OWASP-facing controls are required when multiple users contribute funds toward one booking and can observe shared progress?

## Research asset

- [Security, privacy, and abuse controls research](../assets/05-security-privacy-and-abuse-controls.md)

## Answer

Group-funded booking should reuse GetPrio's existing role-aware booking and private payment-proof posture, but add controls for public campaigns, multi-contributor contribution privacy, refund obligations, and campaign abuse.

Required controls:

1. Public campaign views are privacy-minimized. Guests may see vendor, branch, service, schedule, deadline, required contribution, aggregate verified funding progress, masked organizer identity, and a moderated 280-character description. Guests must not see participant lists, full organizer identity, contact details, payment references, proof images, refund evidence, internal notes, or audit events.
2. Contribution actions require an authenticated Customer account. Guests can preview public campaigns, but joining, submitting payment proof, viewing own contribution state, and receiving refunds require login/registration.
3. Campaign ownership is explicit. The organizer can edit public/private visibility and description only while campaign rules allow edits; contributors can read only their own contribution/payment/refund records; vendors can manage vendor-owned campaign review/payment/refund operations; platform admins can inspect governance data.
4. Vendor Staff access must be permission-scoped. Vendor Admin can manage configuration and review campaigns. Vendor Staff may review contribution/payment/refund evidence only if granted booking/payment operations permission for that tenant/location; otherwise they see limited operational summaries.
5. Payment proof must remain private per contribution. Store contribution proof images as private objects with short-lived signed access, image type/size validation, object-key ownership checks, and role-scoped access for the contributor, authorized vendor users, and platform admins.
6. Funding integrity requires transactional ledger updates. Only vendor-verified contributions count toward funded amount and paid participant count; submitted/rejected proofs do not count; contribution status transitions must be one-way where appropriate and idempotent.
7. Refund integrity requires separate refund records. Refund obligations link to individual contributions, include reason/status/vendor actor/timestamps/evidence, and are not inferred only from campaign status. Vendor cancellation, vendor rejection, deadline failure, and review-hold expiry create refund obligations; organizer/customer no-show after approval enters `policy_review_required`.
8. Public descriptions require inline moderation plus reporting. V1 should enforce max length, profanity/abuse checks, escaping/sanitized rendering, and report-abuse controls. A full pre-publication human moderation queue is not required for v1 unless content is flagged or repeatedly reported.
9. Rate limiting and abuse throttles are required on campaign create/edit, public campaign lookup, join/contribution proof submission, proof access, report abuse, and vendor verification/rejection/refund endpoints.
10. Anti-dark-pattern cancellation is a security/privacy control, not only UX. Cancellation must clearly explain refund consequences, default to non-destructive actions, and log actor/reason/timestamp for organizer cancellation, vendor rejection, vendor cancellation, and refund actions.
11. Audit trails must cover sensitive state changes. Record campaign created/edited/visibility changed, contribution submitted/verified/rejected, funding completed, hold created/expired, vendor approved/rejected, replacement slot proposed/accepted/declined, organizer canceled, refund obligation created, refund marked complete, and platform moderation actions.
12. OWASP-facing controls must cover broken access control, injection, stored XSS, insecure file upload, payment/reference tampering, CSRF for cookie-authenticated state changes, rate-limit gaps, security logging failures, and excessive data exposure.
13. Privacy documentation and IAS inventories must be updated. Group-funded booking adds organizer descriptions, participant/contribution records, proof images, refund evidence, public campaign metadata, report-abuse records, and event/audit records to the data inventory and attack surface map.
14. Tests should prove public payload minimization, customer ownership boundaries, vendor tenant/location permissions, staff permission limits, platform admin access, payment proof privacy, funding-count integrity, refund obligation creation, profanity/length validation, and rate-limit behavior.
