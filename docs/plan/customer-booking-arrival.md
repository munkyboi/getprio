# Customer booking arrival

## Implemented contract

- Branch setting: `customerSelfCheckInEnabled`, default false. Only admins with `tenant.location.manage` can change it through the existing location write routes.
- Authenticated `POST /api/account/bookings/:bookingId/arrival` and `/api/v1/account/bookings/:bookingId/arrival`. Request body cannot select a tenant, branch, priority, ticket owner, or late override.
- Same ownership checks and booking row lock on retries/concurrent staff arrival. Exactly one ticket is linked; customer retries return it. Cancellation, no-show, payment-proof changes, and rescheduling use an atomic unarrived guard so stale writes cannot detach or invalidate an arrived booking.
- Confirmed/rescheduled only, verified manual payment where required, active branch/vendor, ±15-minute arrival window, open intake. Late arrival remains a staff decision.
- Customer-origin tickets use `online`; staff uses `vendor`. `checkedInByUserId` records the actor; ticket notes describe the arrival path.
- `Call next` skips booking-linked tickets before their scheduled start, for both staff and customer arrival. No early-call override in this slice.
- Queue views display the booked start; waiting order places ready tickets first. Near-turn notifications skip future booking starts. This is a timing gate, not actual occupancy.

## Review and release gates

Static frontend/backend type checks, focused lint, whitespace review. No local test suite or database migration was run for this request. The existing queue-order assertion was updated after hosted CI identified its old ordering expectation. Hosted checks and runtime verification remain required.

In an isolated environment, verify branch opt-in/off, cross-customer denial, early/late window, paused/closed intake, concurrent staff/customer arrival and retry, schedule-bound calling, and normal walk-in calling. Inspect the new branch switch and customer action on mobile/tablet/desktop. Do not enable the setting or change bookings in production as part of read-only release inspection.

This includes the web booking page and the versioned backend contract. Native mobile presentation has not been changed. The customer arrival window uses the authoritative booking start, matching the backend even if bundle display times differ after rescheduling. Arrived bookings direct staff to the live queue instead of offering incompatible booking edits.

## Next slice

Optional staff service start/completion is implemented in the service timing slice; see `service-timing.md`. Configure generic resource pools and service requirements, then add transactional resource allocation for opted-in vendors. Resource tracking remains disabled by its existing database constraint. Do not publish occupancy-based wait estimates or reinterpret called/served history as actual occupancy. Existing vendors keep their simple workflow.
