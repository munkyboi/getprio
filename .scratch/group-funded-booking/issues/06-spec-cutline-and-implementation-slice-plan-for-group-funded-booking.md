Type: task
Status: resolved
Blocked by: none

## Question

Once the core decisions are made, what is the smallest coherent spec and execution slice sequence to introduce group-funded booking into GetPrio without destabilizing the existing booking, manual-payment, notification, and capacity flows?

## Working notes

- Rule agreed: the first implementation boundary should be schema/domain foundation, not UI, because customer and vendor flows depend on stable campaign, contribution, refund, event, capacity-hold, and eligibility records.
- Rule agreed: group-funded booking should not be forced into the existing `bookings.payment_*` fields. Normal `bookings` rows are created only after full funding and vendor approval.
- Rule agreed: the implementation should reuse existing branch-service configuration through `location_services`, extending it with group-funded eligibility/settings rather than creating a separate vendor settings surface first.
- Rule agreed: the first customer-facing path should support private-link campaigns before public vendor-profile discovery, because private campaigns exercise the core lifecycle with less discovery and moderation surface.
- Rule agreed: vendor contribution verification and funded-campaign review must land before public discovery, because public campaigns should not invite contributors into an unreviewable operational state.
- Rule agreed: vendor review must use a dedicated group-funded capacity hold before creating the normal booking, so the existing booking capacity behavior remains intact until approval.
- Rule agreed: account/vendor/admin visibility, audit, rate limits, and IAS documentation are not cleanup tasks. They are the final acceptance gate before the feature can be treated as capstone-ready.

## Answer

The smallest coherent rollout is a six-ticket sequence that keeps the existing single-payer booking flow stable while introducing group-funded booking as a separate funding domain.

1. [Schema and domain foundation](./08-schema-and-domain-foundation-for-group-funded-booking.md)
   - Add `location_services` group-funded settings.
   - Add group-funded campaign, participant, contribution, refund, event, and capacity-hold tables.
   - Add a campaign link/source marker to normal bookings for the post-approval handoff.
   - Keep normal booking payment evidence untouched.
2. [Backend campaign lifecycle and ledger APIs](./09-backend-campaign-lifecycle-and-ledger-apis-for-group-funded-booking.md)
   - Create private-link campaigns from eligible branch/service selections.
   - Submit and review contribution payment proof.
   - Transactionally update verified funding totals.
   - Expire missed-deadline campaigns and create refund obligations.
3. [Vendor operations and review flow](./10-vendor-operations-and-review-flow-for-group-funded-booking.md)
   - Add vendor settings management for branch-service eligibility.
   - Add funding-in-progress and fully funded vendor views.
   - Create the 24-hour group-funded capacity hold after full funding.
   - Support vendor approval, rejection, replacement-slot proposal, review expiry, and manual refund tracking.
4. [Customer organizer and contributor experience](./11-customer-organizer-and-contributor-experience-for-group-funded-booking.md)
   - Add organizer start mode in the existing booking flow.
   - Add private campaign detail/share page.
   - Add contributor join/payment-proof flow.
   - Add account surfaces for organizer/contributor campaign states and refund state.
5. [Public discovery and moderation surface](./12-public-discovery-and-moderation-for-group-funded-booking.md)
   - Add `Booking options` tabs on vendor profiles.
   - Show public campaigns only when `allow_public_campaigns` is enabled.
   - Enforce masked organizer identity, privacy-minimized payloads, description length/moderation, and report-abuse controls.
6. [Security, tests, smoke, and capstone documentation](./13-security-tests-smoke-and-capstone-docs-for-group-funded-booking.md)
   - Cover RBAC, tenant/location boundaries, contributor ownership, proof privacy, funding/refund integrity, rate limits, and audit/events.
   - Update IAS privacy and vulnerability artifacts for the new data and attack surface.
   - Add local smoke coverage for private campaign creation, contribution verification, vendor approval, and linked booking creation.

This sequence deliberately defers public discovery until after the private campaign and vendor review loop works end to end. The first usable vertical slice is private-link group-funded booking for one eligible branch/service: organizer creates campaign, contributors submit proof, vendor verifies contributions, full funding creates a review hold, vendor approves, and GetPrio creates one normal paid booking owned by the organizer.

## Guardrails

1. Do not create normal `bookings` rows during the funding stage.
2. Do not count submitted or rejected payment proof toward funding.
3. Do not expose contributor contact details, proof images, refund evidence, or participant lists in public payloads.
4. Do not add deadline extensions, participant swaps, overfunding, uneven shares, or single-payer fallback conversion in v1.
5. Do not make vendor approval possible before full verified funding.
6. Do not let UI-only visibility checks stand in for server-side role and tenant/location authorization.

## Next ticket

Start implementation planning with [Schema and domain foundation](./08-schema-and-domain-foundation-for-group-funded-booking.md). That ticket should define the exact migration fields, repository/service module names, statuses, indexes, and test fixtures before any customer or vendor UI work begins.
