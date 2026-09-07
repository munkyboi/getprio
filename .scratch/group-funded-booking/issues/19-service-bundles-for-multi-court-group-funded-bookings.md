# Service bundles for multi-court group-funded bookings

## Question

How should GetPrio model a group-funded booking where one group funds multiple bookable resources at the same vendor branch for the same visit, such as 8 people renting VIP Court and Court 1 simultaneously?

## Decision

Treat this as one group-funded Service Bundle, not as 8 individual participant bookings and not as a generic service cart.

The campaign represents one shared visit owned by one organizer. Contributors fund equal shares toward the total bundle price. For the court example, the selected bundle contains VIP Court and Court 1, both scheduled for the same start time in parallel mode. The campaign should require both courts to be available before vendor review can begin, should create separate capacity holds for each selected court, and should only become confirmed if every selected court can still be reserved.

## Rules

1. A Service Bundle is made from active, group-funded-enabled branch services at the same tenant location.
2. A parallel bundle starts all selected services at the same scheduled start time. Its visit end time is the latest selected-service end time.
3. The funding target is the sum of the selected branch-service prices, including each selected service's booking quantity if units apply.
4. Required contributor count remains a campaign-level value. In the example, 8 contributors fund the combined VIP Court + Court 1 price.
5. Contribution shares stay fixed and equal using the existing campaign rounding rule.
6. Funding-stage campaigns still do not hold capacity.
7. After full funding, capacity re-check must pass for every selected service before the vendor review hold is created.
8. Vendor review creates one active capacity hold per selected service/resource, not one broad location hold.
9. Vendor approval should create one organizer-owned confirmed booking linked to the campaign, with bundle line items preserved for audit, display, and capacity traceability.
10. Public and customer-facing payloads can show the selected service names, schedule, total price, required contributors, and funding progress, but must not expose participant payment proof or private refund state.

## Implementation impact

The current implemented campaign schema stores a single `service_id`, single `location_service_id`, one snapshotted service name/slug, one `booking_quantity`, and capacity-hold lookup assumes at most one active hold per campaign. That is sufficient for a single-service group-funded booking but not for VIP Court + Court 1 used simultaneously.

A future implementation slice should add bundle line items before changing customer UI:

1. Add `group_funded_booking_items` with campaign, tenant, location, service, location-service, service snapshot, quantity, price snapshot, scheduled start/end, and execution mode fields.
2. Keep campaign-level funding, organizer, visibility, deadline, status, and contribution ledger fields.
3. Update slot and capacity validation to evaluate every bundle item transactionally.
4. Replace single active-hold assumptions with per-item holds and vendor approval that requires every active hold to remain valid.
5. Update vendor/customer/public DTOs to expose a safe `bundleItems` list and a concise bundle title.
6. Preserve category-agnostic language: courts are an example of parallel resource booking, not a hard-coded sports model.

## Acceptance checks

1. A campaign can represent 8 contributors funding VIP Court and Court 1 for the same time block.
2. VIP Court being unavailable blocks the whole bundle even when Court 1 is free.
3. Court 1 being unavailable blocks the whole bundle even when VIP Court is free.
4. Existing single-service group-funded campaigns continue to work as a one-item bundle.
5. Vendor review, approval, rejection, refunds, audit events, and public privacy rules still behave at the campaign level.

## Implementation summary

Implemented the backend bundle foundation:

1. Added `group_funded_booking_items` and linked capacity holds to optional campaign item ids.
2. Existing single-service campaigns are backfilled and treated as one-item bundles.
3. Campaign creation accepts `bundleItems` for parallel same-visit services while preserving the existing single-service request shape.
4. Funding target and fixed contributor share use the sum of selected bundle item prices.
5. Capacity checks now evaluate every selected bundle item.
6. Vendor review and replacement-slot acceptance create one capacity hold per bundle item.
7. Account, vendor, and public campaign DTOs expose safe `bundleItems` data without exposing contribution proof or refund internals.

Verification:

- `node --test backend/tests/groupFundedBookingsRepository.test.cjs`
- `node --test backend/tests/groupFundedBookingService.test.cjs`
- `npm --workspace backend run test`
- `git diff --check`
