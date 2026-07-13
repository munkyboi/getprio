Type: implementation-ticket
Status: implemented
Blocked by: 08, 09

## Question

How should vendor-side users configure eligibility, review funded campaigns, hold capacity, approve or reject, propose replacement slots, and track manual refunds?

## Scope

Implement vendor operations:

1. Add branch-service group-funded settings to service management.
2. Add vendor campaign lists for funding-in-progress, review-ready, approved, rejected, expired, and refund-pending states.
3. Add contribution proof access and verification/rejection controls for authorized vendor users.
4. Re-check slot availability when full funding is reached.
5. Create a 24-hour dedicated group-funded capacity hold if the slot is still available.
6. Support vendor approval that creates one normal paid organizer-owned booking.
7. Support vendor rejection, review expiry, replacement-slot proposal, organizer acceptance/decline handling, and manual refund tracking.

## Acceptance checks

1. Vendor approval is unavailable before full verified funding.
2. Group-funded capacity holds are separate from normal bookings.
3. Approval creates exactly one normal booking owned by the organizer.
4. Vendor rejection and review expiry create refund obligations for verified contributions.
5. Vendor Staff access is permission-scoped and tenant/location-scoped.

## Implementation result

Implemented the vendor operations slice:

1. Added vendor campaign listing/detail, contribution proof verification/rejection, approval, rejection, review-expiry, replacement-slot proposal, and manual refund tracking APIs under `/api/vendor/tenant/:tenantSlug/group-funded-campaigns`.
2. Added organizer replacement-slot accept/decline APIs under `/api/account/group-funded-campaigns/:campaignIdOrToken/replacement-slot/*`.
3. Persisted replacement-slot proposal snapshots on `group_funded_bookings` so organizer decisions are stateful and auditable.
4. Kept group-funded review holds separate from normal bookings, including hold release, expiry, and conversion when approval creates the organizer-owned paid booking.
5. Added service coverage for replacement proposal, organizer acceptance into vendor review, and manual refund completion.

Verified with:

1. `node --test backend/tests/groupFundedBookingService.test.cjs backend/tests/groupFundedBookingsRepository.test.cjs backend/tests/bookingsRepository.test.cjs`
2. `npm --workspace backend run test`

## Out of scope

- Public vendor-profile campaign discovery.
- Contributor-facing account UI.
