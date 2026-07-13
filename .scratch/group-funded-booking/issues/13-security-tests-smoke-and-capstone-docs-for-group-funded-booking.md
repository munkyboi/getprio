Type: implementation-ticket
Status: implemented
Blocked by: 08, 09, 10, 11, 12

## Question

What final verification, smoke coverage, RBAC/privacy checks, and capstone documentation updates are required before group-funded booking is considered ready?

## Scope

Add the final acceptance layer:

1. Backend tests for campaign creation, contribution verification, funding completion, refund obligation creation, vendor approval, linked booking creation, and review expiry.
2. RBAC tests for Customer, Vendor Staff, Vendor Admin, Platform Admin, guest, tenant, and location boundaries.
3. Privacy tests for public payload minimization, proof access, contribution ownership, refund evidence, and vendor staff permission limits.
4. Rate-limit and audit/event tests for campaign create/edit, contribution proof submission, proof access, vendor verification/rejection, refund completion, and report abuse.
5. Smoke-test stages for private campaign creation, contribution verification, vendor approval, and linked booking creation.
6. IAS documentation updates for privacy inventory, auth/access control, OWASP attack surface, vulnerability findings, and remediation plan.

## Acceptance checks

1. Existing booking, queue, payment proof, and vendor service tests still pass.
2. Group-funded tests cover successful and refund-triggering lifecycle paths.
3. Smoke coverage can run without depending on public discovery.
4. IAS artifacts include group-funded campaign data, contribution proof, refund evidence, public campaign metadata, and new endpoints/forms.

## Implementation notes

- Added explicit RBAC assertions that Vendor Staff cannot use the `tenant.booking.manage` permission used by group-funded vendor review/refund routes, Vendor Admin/Owner are tenant-scoped, and Platform Admin does not implicitly bypass tenant booking permissions.
- Added an opt-in `scripts/smoke-test.mjs --stage group-funded` flow for private campaign creation, contribution proof submission, vendor verification, and vendor approval/linked booking creation when the local fixture permits it.
- Added `docs/ias/group-funded-booking-security-privacy-addendum.md` with privacy inventory, RBAC notes, OWASP attack surface additions, verification evidence, and residual risks.
- Updated `docs/plan/capstone-route-role-inventory.md` and `docs/plan/capstone-ias-security-privacy-prd.md` so group-funded account/public/vendor endpoints and data classes are included in capstone IAS traceability.

## Out of scope

- Production payment gateway settlement.
- Automated refund rails.
- Post-v1 campaign recovery features such as deadline extension or participant swaps.
