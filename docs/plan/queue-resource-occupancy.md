# Optional resource occupancy and booking-aware queue estimates

Status: proposed implementation plan, 3 October 2026. No runtime change.

## Goal

Estimate when a customer can start service using the resources and duration their service needs. Support rooms, equipment, staff capacity, courts, and other vendor services through the same model. Existing queue operations remain the default. AI model rollout remains on hold.

## Current evidence

- `queueService.updateCurrentTicketStatus` marks a linked booking completed when its ticket is served. There is no independent service session or actual resource-release event.
- Calling the next ticket currently requires resolving the location's current called ticket. A service counter identifies a call destination; it is not an occupancy resource.
- `waitTimePredictor` uses position multiplied by vendor average service minutes. Dashboard waiting estimates use the waiting-ticket count as that position.
- `queueEstimationInputs` exposes booking schedule durations for diagnostics, without changing the baseline calculation.
- Booking capacity can be scoped to a service or location. This expresses reservation capacity, without an explicit physical-resource allocation.
- Booking quantity multiplies duration. Quantity must not be reused as resource demand.
- BKG-A4F2B19D belongs to PB001. PB002 has no stored booking linkage. The customer has since closed these tickets; they are historical examples.

## Product rules

### Default services

Keep call, confirm where required, serve, skip, cancel, and existing booking completion behavior. No additional controls or required fields for these vendors.

### Services with resource tracking enabled

A vendor admin explicitly maps a service to a location resource pool and declares its demand. Start with pools of interchangeable units; named units and multi-pool requirements are later extensions.

Examples: three interchangeable treatment rooms form a pool with capacity three. Three individually bookable, non-interchangeable courts can each have a separate pool with capacity one. Services sharing staff or equipment must map to the same pool to share its limit.

| Event | Queue effect | Resource and booking effect |
| --- | --- | --- |
| Check in booking | Creates or links the waiting ticket | Reservation remains; no actual occupancy starts |
| Call customer | Ticket becomes called | No resource allocation or service start |
| Start service | Atomically resolves the called ticket as served, preserving confirmation requirements | Creates active service sessions and allocates resources; booking remains active |
| Complete service | Ticket remains served | Releases that session's resources; completes booking only after all required sessions finish |
| Skip before start | Existing missed/recovery behavior | No active occupancy; reservation is handled through existing booking/no-show rules |
| Cancel before start | Cancels ticket and resolves linked booking under existing cancellation policy | Releases reservation; there must be no active session |
| End service early | No queue change | Explicit staff action closes an active session with a reason and releases occupancy |
| Close queue day | Existing queue-day closure behavior | Does not end active sessions or release their resources |

For tracked services, replace the called-ticket primary action with **Start service**. Show active sessions separately with **Complete service**. Avoid showing the old Serve action as an alternative path that can bypass allocation. Public and mobile views show **In service** from the session, even though the underlying ticket has left the waiting queue.

Do not reopen old completed bookings or reinterpret historical served tickets as active sessions. Disabling tracking is blocked while active sessions exist. Future reservations must be reconciled before changing pool mappings or reducing capacity.

### Schedule versus actual use

- Reservation intervals protect capacity before the customer arrives. Use existing pending-hold expiration and active booking rules.
- Actual occupancy starts only through an authorized Start service action and ends through explicit completion or early termination.
- Expected end is an estimate, never an automatic resource-release event. An overdue active session blocks allocation and produces an uncertain estimate until staff updates or completes it.
- For a scheduled booking, a late arrival retains its booked end by default. Staff must explicitly approve an extension after checking subsequent reservations. Expired intervals require an explicit revised service plan before starting.
- Walk-in and mobile sessions use the selected service duration, or a staff-approved duration. Resource demand is the configured service demand, independent of ticket channel.
- A bundle creates one session per service item. Parallel items can start together only if all their required capacity is available; partial starts are excluded from the first release. Sequential items start at their planned offsets, with each later step rechecking capacity. Do not mark the whole booking completed after its first item.
- Three parallel three-hour services occupy three units for three hours when mapped to one pool. Their elapsed bundle duration is three hours; the resource workload is nine unit-hours. These are different measures.

## Data and transaction design

Proposed additive tables and fields:

1. Location resource pools: tenant, location, label, integer capacity, enabled state, revision.
2. Service resource requirements: service, location, pool, positive integer units required. One pool per service in the first release.
3. Operational service plan: ticket, optional booking/item, selected service, duration, requirement snapshot, plan revision. Snapshot configuration so edits cannot rewrite active work.
4. Service sessions: plan/item, actual start, expected end, actual end, state, ending reason, actor references, revision.
5. Resource allocations: session, pool, units, allocated/released timestamps.
6. Operational events: start, complete, end early, revise expected end, and configuration changes, with actor, reason, and idempotency key.

Build one capacity ledger service for reservation validation, allocation, extension, and estimation. A reservation and its active session represent the same demand during overlapping intervals: correlate by booking item and count it once. An overrun adds occupancy beyond the reservation's end. Never add a second independent counter that booking availability cannot see.

All writes use a database transaction and lock the relevant pool rows in stable ID order. Under those locks, recheck reservations, active allocations, service-plan revision, scope, and ticket/session state. Booking creation and rescheduling must use the same locks; locking only service starts cannot prevent races with new reservations. Enforce positive demand, valid intervals, and at most one active session per plan item. A start retry returns the original result; simultaneous starts cannot allocate beyond capacity. Acquire/release and queue/booking updates commit together.

Use tenant/location-scoped foreign keys where supported and repository predicates everywhere. Preserve existing queue and assigned-booking authorization; configuration is vendor-admin-only. Staff actions require access to the relevant location and operational booking/session. Customers cannot submit allocation, duration override, or completion commands.

Sessions can outlive a queue day or cross midnight. They belong to the location and actual time interval, not just the current business-date queue. Completion must remain available after queue closure.

## Deterministic estimates

Keep calculation in the existing backend behind the predictor interface. Inputs: ordered eligible waiting tickets, their service plans, active sessions, future reservations, pool capacity, and current time. No extra droplet is required for this design.

Project feasible service starts on a copy of the capacity ledger, using half-open intervals `[start, end)` and server timestamps. Preserve existing priority and queue order. In the first release, an earlier ticket blocks a later ticket requiring the same pool; tickets using independent pools can proceed independently. Estimates never change ticket state or silently choose whom staff must call.

For a bundle, project each item's interval according to its execution mode and enforce demand for every pool. Report wait until its first service begins, separately from expected service completion. Own booked duration is service time, not automatically the customer's wait. Upcoming reservations can push a walk-in start beyond the next slot if the full duration would not fit.

Unknown service/resource requirements prevent a reliable projection for affected tickets. Retain the vendor-average fallback and identify its source; do not treat those tickets as consuming zero capacity. Mixed tracked and untracked work competing for a pool needs an explicit service plan before resource-aware estimates can be published for that pool.

Return estimate source, predicted start or unavailable reason, observation time, and confidence/uncertainty metadata. Do not invent numeric ranges without an evaluated uncertainty method. Overdue occupancy or paused operations may require **Estimate unavailable**. Keep baseline and proposed versions separate in shadow captures.

Dashboard **Waiting** remains a ticket count. Replace its ambiguous aggregate time with an explicitly labelled **Estimated wait for a new ticket** only when a service is selected; otherwise show per-service estimates or omit the aggregate. Individual ticket pages show the estimate for that ticket.

## Delivery slices

### 1. Foundation and diagnostic projection — next implementation

- Add the pool/requirement model and scoped repositories, disabled by default.
- Build the shared reservation ledger adapter using existing booking/item intervals and capacity semantics. Explicitly map pools; never infer physical resources from service names or quantity.
- Add a read-only, vendor/location-scoped diagnostic reporting reservation demand, mapping gaps, conflicts, and baseline versus proposed schedule projection. Untracked actual occupancy must be reported as unknown.
- Keep customer estimates and all queue transitions unchanged. This slice cannot claim actual availability or activate tracking.
- Document the API/data contracts and additive migration rollback constraints. No production history rewrite.

### 2. Vendor configuration and service sessions

- Add mobile-first admin pool/service configuration and explicit reconciliation of future bookings before activation.
- Add service selection for walk-ins and mobile issuance where required; booking check-in inherits its item plans. Tickets without app users have the same plans and sessions.
- Add Start service, active-session list, Complete service, and End early, with scope checks, transaction locks, retries, and reservation conflict feedback.
- Integrate pool checks into booking creation, rescheduling, availability, and extensions before enabling the feature.
- Ship customer session status and real-time updates alongside the vendor controls. Retain customer confirmation rules and notification preferences.

### 3. Shadow evaluation and estimate publication

- Capture predicted starts and actual session starts/completions for every participating ticket channel.
- Separate synthetic sandbox activity, ordinary vendor observations, baseline versions, and resource projections in reports.
- Evaluate later observations against earlier predictions by location/service/pool; inspect missing plans, overdue sessions, cancellations, and coverage before publishing.
- Publish deterministic resource estimates only for configured pools with trustworthy operational data. AI training and rollout remain a separate future decision.

## Acceptance scenarios for implementation review

- An unconfigured vendor still calls and serves customers exactly as today.
- Calling a tracked ticket consumes no capacity; starting it does. Resolving a waiting ticket or closing the queue cannot release an active session.
- A booking of three parallel three-hour items consumes each required unit for its interval, without multiplying elapsed duration by three.
- A walk-in and a mobile ticket requesting the same service receive the same treatment; no scan is required for session capture.
- An upcoming reservation prevents a walk-in whose full duration would overlap it. The checked-in booking's reservation and occupancy are counted once.
- Concurrent starts and booking submissions cannot overbook a pool. Duplicate completion cannot release capacity twice.
- Overruns, early termination, midnight crossing, paused intake, and queue closure produce explicit operational states.
- A bundle completes only after its required sessions finish; a later sequential step cannot allocate unavailable capacity.
- Unauthorized tenant/location access fails on the server. Public outputs expose no internal identities or resource audit records.
- Historical PB001/PB002 data remains unchanged. The foundation slice changes neither baseline estimates nor production lifecycle behavior.

## Source references

- [Existing check-in decision](../adr/0001-booking-check-in-creates-queue-ticket.md)
- [Booking quantity and capacity semantics](booking-queue-mvp-prd.md)
- `backend/src/services/queueService.js`
- `backend/src/services/bookingService.js`
- `backend/src/services/queueEstimationInputs.js`
- `backend/src/services/waitTimePredictor.js`
