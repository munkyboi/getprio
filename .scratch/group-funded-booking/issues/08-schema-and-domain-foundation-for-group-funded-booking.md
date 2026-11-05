Type: implementation-ticket
Status: implemented
Blocked by: none

## Question

What exact schema, status vocabulary, repository boundaries, and fixtures should be added first so group-funded booking can exist as a separate funding domain without changing normal booking behavior?

## Planning asset

- [Schema foundation plan](../assets/08-schema-and-domain-foundation-plan.md)

## Scope

Define the database foundation for group-funded booking:

1. Extend `location_services` with group-funded eligibility/settings:
   - `group_funded_enabled`
   - `group_funded_min_required_contributors`
   - `group_funded_max_required_contributors`
   - `group_funded_default_required_contributors`
   - `group_funded_min_contribution_amount_cents`
   - `group_funded_max_contribution_amount_cents`
   - `group_funded_min_deadline_hours`
   - `group_funded_max_deadline_days`
   - `group_funded_allow_public_campaigns`
2. Add parent campaign records for funding-stage group-funded bookings.
3. Add participant records, contribution records, refund records, event timeline records, and dedicated group-funded capacity-hold records.
4. Add the minimal normal booking link/source fields needed after vendor approval.
5. Add repository mappers and tests that prove group-funded payment evidence is separate from `bookings.payment_*`.

## Answer

The first implementation slice should be a schema/repository-only foundation. It should add the new tables, mapper boundaries, and tests, but it should not add customer or vendor routes yet.

1. Add one migration, tentatively `database/migrations/20260712_add_group_funded_bookings.sql`, and mirror it into `database/init.sql`.
2. Extend `location_services` instead of creating a separate settings table, because branch-service eligibility is already modeled there.
3. Add `group_funded_bookings` as the parent funding-stage campaign table. It owns organizer authority, selected service/location/schedule snapshot, funding terms, campaign status, visibility, linked normal booking id, and cached aggregates.
4. Add separate `group_funded_booking_participants`, `group_funded_booking_contributions`, `group_funded_booking_refunds`, `group_funded_booking_events`, and `group_funded_capacity_holds` tables.
5. Add nullable link/source fields to `bookings` so a vendor-approved group-funded campaign can create one normal paid organizer-owned booking without copying contribution evidence into `bookings.payment_*`.
6. Add `backend/src/repositories/groupFundedBookings.js` for campaign/participant/contribution/refund/event/hold persistence. Keep service orchestration for ticket `09`.
7. Extend `backend/src/repositories/locationServices.js` and `backend/src/routes/vendorRouteHelpers.js` only far enough to round-trip the new location-service settings.
8. Add focused repository tests in `backend/tests/groupFundedBookingsRepository.test.cjs` plus location-service mapper tests. Existing booking repository tests should continue to pass without group-funded fixtures.

## Status vocabulary

1. Campaign status:
   - `draft`
   - `funding`
   - `organizer_canceled`
   - `funding_failed`
   - `funded`
   - `slot_recovery`
   - `vendor_review`
   - `replacement_proposed`
   - `vendor_approved`
   - `vendor_rejected`
   - `vendor_review_expired`
   - `confirmed`
   - `vendor_canceled`
   - `policy_review_required`
2. Participant role:
   - `organizer`
   - `contributor`
3. Contribution status:
   - `pending_proof`
   - `submitted`
   - `verified`
   - `rejected`
   - `refund_pending`
   - `refunded`
   - `policy_review_required`
4. Refund status:
   - `pending`
   - `in_progress`
   - `completed`
   - `rejected`
   - `policy_review_required`
5. Capacity hold status:
   - `active`
   - `released`
   - `expired`
   - `converted`

## Repository boundaries

1. `locationServices` owns branch-service settings and should map the new group-funded fields as a nested `groupFunded` object in JavaScript while preserving existing top-level fields.
2. `groupFundedBookings` owns campaign, participant, contribution, refund, event, and hold row persistence.
3. `bookings` should only gain the linked campaign/source fields needed to mark the approved normal booking as group-funded-originated.
4. `bookingService` should not be changed in this ticket except if a mapper needs to expose nullable linked campaign fields without behavior changes.
5. Payment proof storage paths remain a later ticket; this ticket stores the contribution proof metadata columns and proves they do not touch booking payment proof columns.

## Acceptance checks

1. Existing booking tests still pass without requiring group-funded data.
2. `location_services` can store branch-service group-funded settings independently per location.
3. A campaign can be inserted with snapshotted service/location/schedule/funding terms without creating a normal booking.
4. Contributions, refunds, and events can be recorded against the campaign.
5. The linked normal booking field remains nullable until vendor approval.
6. Tests prove contribution proof metadata is read from `group_funded_booking_contributions`, not from `bookings.payment_*`.

## Implementation result

Implemented in the schema/repository slice:

1. Added `database/migrations/20260712_add_group_funded_bookings.sql` and mirrored the schema in `database/init.sql`.
2. Extended `location_services` with group-funded settings and validation.
3. Added group-funded campaign, participant, contribution, refund, event, and capacity-hold tables.
4. Added nullable group-funded link/source fields to `bookings`.
5. Added `backend/src/repositories/groupFundedBookings.js`.
6. Extended `backend/src/repositories/locationServices.js`, `backend/src/routes/vendorRouteHelpers.js`, and `backend/src/repositories/bookings.js` mappers.
7. Added repository/helper tests covering the storage boundary and contribution proof separation.

Verified with:

1. `node --test backend/tests/groupFundedBookingsRepository.test.cjs backend/tests/vendorRouteHelpers.test.cjs backend/tests/bookingsRepository.test.cjs backend/tests/vendorServiceHandlers.test.cjs`
2. `npm --workspace backend run test`
3. `npm run db:migrate`
4. Live Docker schema check for `group_funded_bookings`, `group_funded_booking_contributions`, `bookings.group_funded_booking_id`, `bookings.booking_payment_source`, and `location_services.group_funded_enabled`.

## Out of scope

- Customer UI.
- Vendor dashboard UI.
- Public campaign discovery.
- Automated payment settlement or automated refunds.
