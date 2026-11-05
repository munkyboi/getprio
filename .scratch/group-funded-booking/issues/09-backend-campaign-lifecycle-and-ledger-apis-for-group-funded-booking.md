Type: implementation-ticket
Status: implemented
Blocked by: none

## Question

What backend services and account-facing APIs should create, fund, expire, and refund-qualify private group-funded campaigns while keeping contribution ledger updates transactional?

## Scope

Implement the private campaign lifecycle:

1. Create a group-funded campaign from an eligible branch/service/slot selection.
2. Validate branch payment instructions and `location_services` group-funded settings.
3. Compute exact contribution amount, rounding adjustment, deadline bounds, and immutable funding snapshot.
4. Let authenticated Customers join by submitting one contribution payment proof.
5. Let authorized vendor users verify or reject contribution proof.
6. Count only verified contributions toward funding totals.
7. Move fully funded campaigns into vendor-review-ready state.
8. Expire missed-deadline campaigns and create refund obligations for verified contributions.

## Acceptance checks

1. Campaign creation does not consume booking capacity.
2. Submitted contribution proof does not count toward funding until vendor verification.
3. Duplicate contribution verification is idempotent or rejected safely.
4. Deadline expiry creates refund obligations and timeline events.
5. Contributors can access only their own contribution/refund state.

## Implementation result

Implemented the private backend lifecycle slice:

1. Extended `backend/src/repositories/groupFundedBookings.js` with transactional campaign/contribution reads, user-scoped campaign listing, contribution updates, funding-total recomputation, campaign status updates, and refund reads.
2. Added `backend/src/services/groupFundedBookingService.js` for campaign creation, contribution proof submission, vendor proof verification/rejection, missed-deadline expiry, refund obligation creation, and customer self-state access.
3. Added customer account APIs under `/api/account/group-funded-campaigns` for campaign creation, customer campaign listing, self-state lookup, and contribution proof metadata submission.
4. Added vendor proof review APIs under `/api/vendor/tenant/:tenantSlug/group-funded-campaigns/contributions/:contributionId/*` using existing tenant access plus `tenant.booking.manage`.
5. Added backend tests covering contribution math/rounding, submitted proof not advancing funding, vendor verification moving a campaign to `funded`, missed-deadline refund obligations/events, and contributor-only refund state.

Verified with:

1. `node --test backend/tests/groupFundedBookingService.test.cjs backend/tests/groupFundedBookingsRepository.test.cjs backend/tests/vendorRouteHelpers.test.cjs backend/tests/bookingsRepository.test.cjs`
2. `npm --workspace backend run test`

## Out of scope

- Public campaign listing.
- Vendor replacement-slot review.
- Linked normal booking creation.
