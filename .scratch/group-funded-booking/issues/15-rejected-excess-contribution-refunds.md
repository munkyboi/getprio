Type: implementation-slice
Status: implemented
Blocked by: 09, 10, 11

## Question

How should GetPrio handle contributors whose submitted payment proof is rejected after the campaign is already fully funded, especially when the vendor believes money was received but the contribution cannot be accepted?

## Problem

The current group-funded booking implementation treats these states differently:

1. Verified contributions are counted toward funding and can receive refund obligations when the campaign fails, is rejected, expires, or otherwise becomes refund-eligible.
2. Submitted contributions can be rejected by the vendor with a rejection reason.
3. Excess submitted contributions after the campaign is already fully funded cannot be verified, but rejecting them only marks the contribution as `rejected`.

That is correct for invalid proof or cases where no payment was actually received. It is incomplete for excess contributors who manually sent payment after the campaign had effectively reached the funding target. Those contributors need a refund/return tracking path.

## Slice Goal

Add a clear vendor decision path for rejected contributions:

- invalid or unpaid proof remains a normal `rejected` contribution;
- paid-but-not-accepted proof becomes refund-eligible and creates a refund obligation;
- excess contributions after full funding can be rejected into the refund workflow rather than disappearing as plain rejected proofs.

## Domain Rules

1. Vendors must choose whether rejecting a contribution means `No refund needed` or `Refund required`.
2. `No refund needed` is for invalid proof, duplicate screenshots, wrong amount not received, unreadable proof, or references the vendor cannot match to a payment.
3. `Refund required` is for money the vendor believes was received but cannot be accepted into the campaign.
4. Excess contribution after full funding should default toward `Refund required`, because the campaign cannot accept additional verified contributors.
5. Refund-required contribution rejection creates one `group_funded_booking_refunds` row linked to that contribution.
6. Refund-required rejected contributions should move to `refund_pending`, not plain `rejected`.
7. Refund-required rejection still stores `rejected_at`, `rejected_by_user_id`, and a contributor-visible rejection reason.
8. Refund obligations from rejected contributions appear in the same vendor refund-management UI as campaign-level refund obligations.
9. Contributors see a distinct state: `Contribution cannot be accepted - refund pending`, not just `Proof rejected`.
10. Public campaign payloads must continue to exclude contributor and refund details.

## Backend Plan

1. Extend the vendor contribution rejection request type with a refund intent:
   - `refundDisposition: "not_required" | "required"`
   - optional `refundReason`, defaulting to `contribution_rejected` or `excess_contribution`.
2. Add allowed refund reasons to schema/checks if needed:
   - `contribution_rejected`
   - `excess_contribution`
3. Update `rejectContribution`:
   - keep existing validation that only `submitted` contributions can be rejected;
   - set rejected metadata in all cases;
   - for `not_required`, keep contribution status as `rejected`;
   - for `required`, create a refund obligation and set contribution status to `refund_pending` with `refund_status = pending`.
4. Make refund creation idempotent by checking for an existing refund for the contribution before inserting.
5. Record a domain event that captures both rejection and refund creation:
   - existing `contribution_rejected`
   - existing or new `refund_obligation_created`
6. Return the updated contribution and any created refund in the vendor mutation response.

## Vendor UI Plan

1. Replace the freeform contribution rejection row with a small decision UI:
   - rejection reason input or canned reasons;
   - checkbox or segmented control: `Refund required`;
   - helper copy: `Use this when payment was received but cannot be accepted.`
2. When a campaign is already fully funded, default `Refund required` to true for submitted proofs.
3. After rejection with refund required, show the resulting obligation in `Refund obligations`.
4. Keep invalid-proof rejection simple and fast for vendors.
5. Reuse the existing refund-management controls:
   - `Mark in progress`
   - `Policy review`
   - `Mark refunded`
   - refund notes

## Customer UI Plan

1. In the account group-funded list:
   - plain rejected: `Your proof rejected`;
   - refund-required rejected: `Refund pending`;
2. On campaign details:
   - plain rejected: show rejection reason and say the contribution was not counted;
   - refund-required rejected: show rejection reason plus refund status.
3. Keep contributor privacy intact: contributors see only their own rejected/refund state.

## Tests

1. Backend service test: reject submitted contribution with `refundDisposition = not_required` keeps status `rejected` and creates no refund.
2. Backend service test: reject submitted contribution with `refundDisposition = required` creates a refund, sets contribution to `refund_pending`, and records events.
3. Backend service test: duplicate refund-required rejection cannot create duplicate refunds.
4. Route/type test: vendor rejection endpoint accepts refund disposition and returns refund data.
5. Frontend typecheck for the new request/response contract.

## Acceptance Criteria

1. Vendors can distinguish invalid rejected proofs from paid-but-not-accepted contributions.
2. Excess submitted contributions after full funding can be rejected into refund tracking.
3. Refund-required rejected contributions appear in vendor refund obligations.
4. Contributors can clearly see whether a rejected proof needs no refund or is pending refund.
5. Public campaign views expose no new private contribution or refund data.

## Resolution

Implemented the vendor refund-disposition decision, including retry-safe refund lookup and a database-level one-refund-per-contribution guard. `required` rejections now create an `excess_contribution` or `contribution_rejected` refund obligation and move the contribution to `refund_pending`; ordinary invalid-proof rejections remain `rejected`. The vendor dashboard defaults refund-required for fully funded campaigns, reuses refund-management controls, and customer views distinguish refund-pending contributions. Focused service/route contract tests, the full backend suite, frontend typecheck, and production build pass.
