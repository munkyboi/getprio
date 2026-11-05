# Resource ledger prerequisite and AI snapshot handoff

7 October 2026. Source baseline: fetched `origin/main` at `795722bf88bf30a084f264a466927a6577ac2012`. This is a concrete implementation contract and schema proposal, not an implemented ledger, producer or activated predictor. Vendor shell work remains separately scoped.

## Concrete prerequisite: serialize protected reservations with allocation

Current `bookingService.js` evaluates composed availability before entering the booking creation transaction (main lines 1108–1144). Vendor rescheduling checks slot capacity then performs a separate guarded booking update (lines 1577–1595). `resourceCapacity.js` joins booking bundle intervals to current mutable draft service requirements; it has no frozen protected resource reservation binding. Those paths cannot guarantee capacity against concurrent bookings or service starts, and configuration edits can reinterpret historical reservation demand.

Therefore the first backend slice must establish one scoped lock/write protocol and stable resource reservation bindings, before a Start service allocation path or tracking enablement. This is a prerequisite for truthful resource operation, not a reason to wait for the vendor shell or workflow UI. The empty operator audit establishes no contention behavior or completeness guarantee.

### First backend slice

1. Add an additive per-location ledger control/revision row and immutable scoped reservation bindings keyed by booking item. Keep tracking disabled and no public predictor change. Use existing pool/service-plan identifiers; do not create a second catalog or infer occupancy from timing.
2. Use a single location lock as the initial serialization boundary, acquired before booking, ticket/session and pool locks. Resource configuration already locks the location. Use the same boundary for all reservation-affecting writes; pool locks follow stable numeric order. Audit existing ticket/booking lock order and change competing paths together before activation to prevent inversion.
3. Freeze pool/demand/configuration revision for protected resource intervals when booking writes bind them. Recheck protected overlap and active unreleased allocations under that same transaction. Quantity stays distinct from units. Preserve existing booking pricing, arrival/payment guards and ordinary availability semantics outside tracked pilot scopes.
4. Route create/reschedule/cancel/no-show/payment transitions/pending expiration and booking-item changes through that binding lifecycle. Explicitly define which existing booking statuses protect capacity, including uploaded-proof pending holds. Conversion on service start consumes its binding exactly once and inserts actual allocation atomically. Never count a converted reservation and its allocation twice.
5. Activation reconciliation validates existing reservations and unknown/unselected tickets under the lock. Unknown/stale/unsupported plans or unresolved timing records block activation until staff resolve/bind them. Never backfill an allocation from Called, timing start/end or a synthetic forecast.
6. Add ticket-ID/session-targeted start/complete/terminate and validated extension in the next slice, preserving existing timing observations and ordinary booking outcomes. Complete/terminate explicitly release; cancellation/intake closure/expected end do not. Booking/session writer coverage and real transaction tests must pass before removing the tracking-disabled constraint.

Live allocation is not safe after merely creating empty ledger tables. Initial supported execution is one resource pool and one executable service item per ordinary location-queue work unit. Existing sequential/parallel multi-item plans remain unsupported until an explicit runtime composition contract exists; simulation accuracy does not approve those modes. Workflow stage behavior follows the separately owned journey foundation.

## Versioned internal snapshot proposal

The machine-readable [JSON Schema](resource-operational-snapshot-v1.schema.json) defines `resource-operational-snapshot-v1`. Runtime owns the producer and records; AI owns validation, pure projection and fail-closed fallback. No new live endpoint or hook is introduced. A current-runtime adapter must return `not_ready` with `ledger_unavailable`/`tracking_disabled` and `snapshot: null`; it must not return ready with empty allocation arrays based on an empty audit.

The first proposal intentionally supports resource-only location queues and single-item execution. Scope is tenant/location plus an opaque database/source binding configured independently by the operator. It is not credentials, a hostname inferred by the client or authorization in itself. Workflow stations and independent developer queues require an agreed extension/version rather than guessed identifiers.

A ready snapshot contains committed capacities, actual unreleased allocations, protected unconverted reservations and complete waiting/called/in-service work inventory across business dates. Work references/order keys are opaque and contain no customer identity; order keys must be producer-generated fixed-width sortable values reflecting applicable priority/arrival/tie-break. In-service entries correlate to allocations by `workRef`; they must not be allocated again by projection. `stationArrivedAt` is ordinary location admission in v1; future stage admission cannot reuse original visit time.

Read coherence uses one repeatable-read read-only transaction and a location ledger revision advanced by every covered operational/configuration writer. `configurationRevision` is the scoped monotonic configuration watermark, not a hash mislabeled as an integer. Reservations are intervals overlapping the explicit forecast window; allocation/work inventory is complete across dates. Truncation or missing supported work returns `not_ready`. A short window cannot claim booking protection beyond `window.to`; an expected service interval crossing that bound must fall back.

Ready denotes authoritative complete inventory, **not** a valid forecast or rollout approval. Active allocations may have unknown expected end or unresolved state. AI must fall back for unknown/overdue/unresolved completion, pause conditions it cannot model, reservation conflicts or unsupported states. Actual release times are never predicted facts. The schema exposes no future actual duration/end labels or future arrivals.

### Mandatory semantic validation beyond JSON Schema

- Exact allowlisted scope/source binding, supported contract version, UTC timestamp validity and freshness at consumption. Compare against a trusted server clock; initial proposed maximum age is 5 seconds, subject to agreed integration load/latency tests. Reject future observation timestamps and do not cache past the freshness budget.
- Positive bounded capacities/units; unique pool/allocation/session/work/reservation references; every cross-reference resolves in scope. Demand fits configured capacity; detect overallocated pools rather than pretending available units are nonnegative.
- Strict `startsAt < endsAt`, coherent window and observation time; compare timestamps as instants. Snapshot window must cover the requested forecast horizon; no unreported future reservations may be assumed absent.
- At most one active session per work unit in v1. Every In service entry has its matching allocation; every allocation points to known work. Called/Waiting work consumes no actual occupancy. A protected reservation referenced by an active allocation must already have been converted and therefore must not remain in the protected list.
- Validate stable ordered competition by producer order key, earliest-call readiness, plan/configuration revisions and supported single-item mode. Single-item v1 `durationMinutes` is integer 5–480 inclusive, matching the vendor-service catalog; fractional or longer composed/quantity durations require a separately reviewed bounded extension. Do not gap-fill or add a bypass. Do not silently multiply demand by quantity.
- Derive forecast support separately from `readiness`. Missing/unknown/overdue completion or unsupported disruption causes private fallback diagnostics even when runtime inventory is coherent.

Time-to-call and time-to-service-start remain distinct targets. Preserve baseline and its sample/outcome meaning; a pure projection cannot change public estimates or establish model approval. Validator support can proceed against this proposal, but producer integration waits for writer coverage, scoped ledger data and semantic/concurrency acceptance.

## Required runtime acceptance

Use an isolated database to race two overlapping bookings, booking versus start, reschedule versus start, cancel/expire versus conversion and completion versus extension. Prove no over-allocation, immutable demand, no double-counted conversion, idempotent explicit release and stable lock order. Verify paused/closed intake, unknown/stale plans, pending-payment hold semantics, old cross-date active sessions and both timing modes. Record exact writer coverage before a producer returns ready.

## Current status

No authoritative ledger implementation, migration, API or snapshot producer was added in this handoff. This turn identified the transaction prerequisite and supplied a reviewable schema for the AI-owned validator. Dashboard/runtime owns the backend writer/producer slice; the AI thread must avoid edits to those runtime files while implementing its separate readiness/projection consumer. This handoff does not enable resource tracking or shadow inference.
