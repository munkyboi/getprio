# Queue workflow and resource foundation specification

Status: proposed implementation contract created 5 October 2026; refreshed on 6 October 2026 against fetched `origin/main` at `9b3c198e33b3eac415e635e2b9c93a071bd746e0`. Based on the [completed product decisions](vendor-dashboard-workflow-decisions.md). The owning `booking-ticket-details` checkout remains at `6477f877`; newer source was inspected through Git without merging local planning work. No migration or runtime activation has been performed. See the [dashboard migration inventory](vendor-dashboard-migration-inventory.md) for frontend scope and adjacent configuration work.

## Scope and modes

Build one authoritative server transition interface behind vendor, public/customer, mobile and applicable developer issuance adapters. First enumerate which channels issue ordinary vendor tickets versus independent developer queues; do not silently migrate the independent developer queue product. A supported channel either invokes the same workflow admission contract or explicitly rejects workflow-mapped services. Unsupported channels must not fall back to an ordinary ticket for that service.

| Workflow enabled | Resource tracking enabled | Behavior |
| --- | --- | --- |
| No | No | Existing ordinary queue through a default-station compatibility adapter. |
| Yes | No | Sequential version-pinned journeys with station queues and manual readiness. Requires Pro for new intake. |
| No | Yes | Ordinary service operations with explicit demand, duration and a shared pool ledger. Requires pilot activation. |
| Yes | Yes | Each applicable stage uses both readiness/arrival and resource eligibility. Requires both capabilities. |

First release excludes conditions, loops, parallel branches, active version migration, named units and simultaneous multi-pool requirements. Coordinates and viewport are editor presentation only. Publish validates exactly one ordered path, one entry and terminal stage, reachable nodes, no cycles, valid station references and supported readiness/resource definitions. Add/insert/reorder controls and mobile ordered forms produce the same normalized definition.

## Current implementation constraints

- [queueLifecycle.js](../../backend/src/services/queueLifecycle.js) has waiting, pending carry-over, called, served, skipped, cancelled, unserved and expired ticket states. Its ticket status still has no separate In service value, but main now persists explicit start/end/outcome observations through `serviceTiming.js` and `ticketServiceTimingService.js`. Reuse that observation contract and its recovery semantics; add station/session allocation semantics without recreating timing or interpreting Called as occupancy.
- [queueSnapshotHelpers.js](../../backend/src/services/queueSnapshotHelpers.js) exposes a singular current ticket. Station snapshots need independent called/active service state; a location-wide current slot cannot coordinate independent stations.
- [queueDayLifecycleService.js](../../backend/src/services/queueDayLifecycleService.js) closes tickets and updates linked bookings. Workflow tickets must not use those updates to complete or terminate the whole journey after an intermediate stage.
- [resourceCapacity.js](../../backend/src/repositories/resourceCapacity.js) reads draft mappings and booking bundle intervals. [resourceCapacityProjection.js](../../backend/src/services/resourceCapacityProjection.js) is a hypothetical reservation projection, not transactional allocation or live availability.
- [20261003 foundation migration](../../database/migrations/20261003_add_resource_capacity_foundation.sql) supplies scoped pools and service requirements and explicitly constrains tracking to false. Preserve existing data and scope keys; lift the constraint only in a later operational release.
- [entitlementAdmissionService.js](../../backend/src/services/entitlementAdmissionService.js) supports existing feature flags and read/ongoing/wind-down bypasses. Add a dedicated workflow capability with explicit new-admission versus existing-journey resolution semantics.

### Merged foundation reuse and remaining gaps

Main `ticketServicePlanService.js` captures immutable `ticket_service_plans` in issuance transactions: booking item intervals/durations/execution mode and optional staff-selected walk-in service duration/resource mappings. Unknown demand is `known: false`; old/unselected tickets have `source: unknown`. Reuse these snapshots; define supported assignment/revision before resource start for unknown plans without rewriting historical issuance records. Public/mobile/QR coverage is incomplete and independent Developer API queues have no Vendor Portal catalog contract. Coverage cannot depend on scanning tickets.

Main optional service timing uses one observation per ticket, authenticated server clocks, same-outcome retries and conflicting-outcome 409s. Complete currently resolves a called ordinary ticket and its linked booking; interrupt records an unserved outcome. Unfinished timing can be resolved after closure or setting disablement, preserving the already-terminal queue/booking outcome. A future workflow adapter must separate these ordinary booking updates from intermediate stage completion and keep cancellation/termination outcomes explicit.

Customer booking arrival is now implemented behind branch opt-in, using the booking lock and shared staff/customer path; Call next excludes bookings before scheduled start. Preserve this intake/schedule gate. It does not replace destination staff confirmation for downstream workflow stages or reserve downstream departments automatically.

No merged source inspected here supplies station/journey execution, Pro workflow capability, transactional occupancy or reservation/session conversion. Resource tracking remains constrained off. Baseline time-to-call prediction and offline model preparation stay separate from scheduler eligibility. See [coordination boundaries](vendor-dashboard-ai-coordination.md).

## Ownership and data contracts

Names below are conceptual until the migration slice chooses schema identifiers. All entities carry tenant/location scope, server timestamps and revisions where mutable. References between scoped entities use composite foreign keys; an ID alone never authorizes access. Archive referenced configuration instead of destroying journey history.

| Entity | Owns | Required constraints |
| --- | --- | --- |
| Station | Department queue, operational permissions and intake state | Belongs to one location; independent of a counter and pool. One stable default station per legacy location. |
| Station assignment | Permitted member/station scope | Active tenant membership and compatible location scope; audited management action. Existing counter assignments remain separate. |
| Workflow draft | Editable normalized sequence and presentation metadata | Optimistic revision check; no effect on admitted journeys. |
| Published workflow version | Immutable stages, station mapping and readiness policy | Unique workflow/version; prohibit definition mutation after publication. |
| Service workflow mapping | Explicit future-intake activation | Valid published version in scope; effective revision; admissions snapshot mapping atomically. |
| Journey | Overall visit, selected service/package, pinned version, optional booking | Stable reference; one journey per logical admission/idempotency key; explicit active/completed/cancelled outcome. |
| Stage visit | Eligibility, readiness, arrival and station-local ticket link | Unique journey/stage ordinal for sequential release; at most one live physical stage per journey; admitted time immutable for ordinary ordering. |
| Service session | Actual work start/end/outcome and frozen service plan | At most one active session per stage visit; resource-only sessions may bind an ordinary ticket. |
| Allocation | Units consumed by an active resource session | Single pool initially, positive bounded demand; explicit released timestamp/outcome. |
| Reservation binding | Protected future interval and its conversion to occupancy | Stable booking-item identity, scoped pool, frozen units; consumed/cancelled/expired lifecycle prevents double counting. |
| Command receipt / event | Retry result and audit/realtime evidence | Idempotency key scoped to actor/action/entity; reject reuse with changed payload; unique event identity and aggregate revision. |

The existing issuance plan freezes observed catalog/mapping values. The allocation service binds a validated executable plan at admission or a defined pre-start binding action, retaining the original issuance snapshot and any separately audited revision. Duration is independent of simultaneous units, player count and booking quantity. A service without a valid plan must show a setup problem and block resource-dependent start; never assume one unit or zero duration. Historical sessions retain their plan after service configuration changes.

Booking bundle items already have time intervals and mappings. Reconcile that model with the frozen runtime plan before admitting resource work. A sequential booking execution mode in an existing bundle is not proof of a supported Queue Workflow. First release must reject unsupported bundles/mappings instead of silently treating them as a single stage or multiplying demand by quantity.

## State transitions

A stage begins blocked by prerequisites. Once the previous stage is completed, expose either Awaiting readiness or Awaiting arrival. Destination staff confirm presence to admit Waiting. Calling invites the customer; it allocates nothing. Starting service creates In service and any allocation atomically. Successful completion ends the session, releases allocation and advances eligibility. Only terminal stage completion completes the journey and linked booking through the booking owner contract.

| Command | Preconditions | Atomic result |
| --- | --- | --- |
| Admit journey | Authorized intake, Pro, active service mapping, supported package | Pin version/plan and create first eligible stage. No downstream waiting tickets. |
| Mark results ready | Assigned authorized readiness action, required predecessor work complete | Audit actor/time; expose Awaiting arrival. No report or clinical finding storage. |
| Confirm arrival | Authorized destination, ready eligible stage, journey active | Persist presence and create exactly one station waiting entry; start station waiting clock. |
| Call next | Open permitted station, applicable ordering, no incompatible outstanding call | Move eligible selected entry to Called; notify after commit; no allocation. |
| Start service | Called/present and no other active physical stage; usable demand and capacity | Create session, convert matching reservation binding if applicable, allocate units, publish state. |
| Complete service | Active session, authorized actor, expected revision | End successfully, release allocation, complete stage and expose next readiness/arrival state; terminal journey updates booking once. |
| Recover missed call | Current stage only, staff-confirmed presence, permitted recovery | Retain completed stages and restore using existing recovery band; no journey restart. |
| Extend session | Active session, valid future expected end, authorization | Check protected reservations/ledger under lock; update expected end or return explained conflict. |
| Cancel journey | Authorized action with reason and active journey | Stop progression and close pending/waiting work; active session remains unresolved and occupied. |
| Terminate session | Authorized action with reason and active session | Record early termination, release allocation; never report successful completion automatically. |

Intermediate queue-day closure retains progress and maps carry-over/missed handling to the affected stage only. It must not mark the whole booking fulfilled/unfulfilled merely because a stage ticket closed. Resolve active work explicitly; closing intake, changing workspace, disabling mapping, entitlement loss or forecast expiry never releases occupancy. A results wait can span days without holding a station waiting position or equipment.

Post-cancellation completion may resolve an already active physical session but cannot create the next stage or change a cancelled journey to successfully completed. Prefer the explicit termination action when work stopped early; successful physical work after cancellation must retain the separate journey cancellation outcome. Do not reopen a cancelled journey implicitly.

## Server interface

Expose a small domain interface for publication, admission, readiness/arrival, call/start/complete/recover, extension, cancellation and termination. Route handlers supply validated inputs and authenticated scope; the domain owns authorization-sensitive invariants, transactions, booking integration, receipts and events. Do not duplicate the transition logic in each channel or in React Flow.

Each mutating command takes trusted actor context, tenant/location/station where applicable, entity identifier, idempotency key and expected aggregate revision. A response returns committed state, new revision and a stable operation/event identity. The server resolves membership, capability, station assignment and frozen version from storage; client booleans and timestamps are not authority.

Errors distinguish invalid input (400), unauthenticated (401), denied capability/action (403), unavailable scoped object (404), and stale state/capacity/readiness conflict (409). Response codes/messages must support refresh and retry without leaking another tenant's existence. Identical replay returns the prior committed result only while the actor remains permitted to read it. Changed payload with the same key conflicts.

Transactions serialize the scoped competing work: lock capability/configuration scope where activation races with admission; lock journey/stage; lock station scheduling state and affected pools/reservation bindings in one documented stable order. Recheck authorization/state and ledger under those locks, write all domain changes and the event/receipt, then commit. Choose one lock order across booking reservation writers and session writers; do not improvise inconsistent orders per endpoint. Publish notifications after commit via an outbox/retry mechanism with deduplication.

## Ordering and capacity

Use the existing applicable priority bands, then station admission time and stable ID/sequence tie-break. Original journey intake time is audit context. Determine which bands apply at each station in the mapping contract; an overall booking does not reserve all departments or grant downstream booking priority by itself. Reject unsupported downstream reservation mappings.

Preserve order among eligible entries competing for the same pool. If the earlier entry cannot fit a protected interval, explain its block and do not gap-fill with a later shorter entry. Independent stations/pools can progress. Filter readiness/presence before resource competition; a customer Awaiting arrival does not block the waiting queue. Existing skip/missed actions require their actual presence/missed-call condition and audit, never a disguised resource-fit bypass.

Bookings/reservations and actual allocations share one authoritative accounting contract. Every booking-create/reschedule/cancel/check-in path affecting a tracked pool must use its locks and binding lifecycle. A reserved interval converted to its own active occupancy is counted once. Waiting and Called consume zero physical units. Resource activation cannot ship with only start-service locking while booking writers remain unprotected.

For a pool of four courts, four one-unit sessions can run simultaneously; the fifth waits. A two-court service consumes two explicit units. An expected end forecasts completion but an unreleased allocation continues consuming capacity after it. Overdue occupancy may make a future reservation infeasible: flag a conflict/uncertainty and do not silently move the reservation, force-release the session or promise availability. An extension conflicting with protected future demand is rejected with resolution guidance.

## Authorization and entitlement matrix

| Action | Required authority | Commercial check |
| --- | --- | --- |
| Read operational work | Existing tenant/location rights plus station scope; minimal journey progress | Preserve active-journey resolution visibility after Pro ends. |
| Draft/edit/publish/enable workflows | Explicit configuration permission; preserve owner/admin distinctions | Pro required; check every server mutation. |
| New workflow journey | Permitted intake actor/channel and location | Pro required atomically at admission. Legacy queue bypass cannot grant workflows. |
| Resolve admitted journey | Assigned permitted staff/action; version/state validation | Allowed after Pro ends; no new journey/version/route. |
| Results readiness | Explicit readiness permission and assigned station | Existing admitted journey resolution allowed after Pro ends. |
| Resource configuration/activation | Location/service management and scoped configuration authority | Draft access and live pilot activation are separate; permanent pricing deferred. |
| New resource session | Operational/station authority | Explicit pilot activation; define wind-down before disabling live pilot. |
| Complete/terminate occupied session | Authorized operation and reason where required | Remains available for safe resolution when intake/feature access ends. |

Account suspension, revoked membership and tenant/location restrictions are not overridden by the Pro wind-down rule. Provide resolution via another authorized operator; do not invent an entitlement exception that restores revoked access.

## Booking and channel integration gates

The first workflow booking association binds the selected package and supported workflow mapping. Journey admission pins its actual version. Until an explicit future-version reservation policy exists, a booking alone does not create a journey or pin every downstream station reservation. Changes between booking and admission must be surfaced and validated, not silently applied as an unexpected route.

**Unsettled product gate:** bookings created before Pro expiry but not admitted are not covered by the active-journey exception. Recommended implementation default is to reject new journey admission once Pro has ended and show an owner resolution task, while leaving booking/refund decisions to existing booking policy. Confirm the customer resolution and notification contract before enabling workflow-linked booking sales. Do not auto-cancel/refund or grant indefinite grandfathered intake from this specification.

Inventory vendor issuance, public join, customer/mobile issuance, booking check-in, recovery, closure workers, notifications, queue monitors, ticket lookup and relevant developer integrations. Every enabled entrypoint shares the contract; snapshots/events include scope and revision. Reauthorize realtime subscriptions and reconnects. Legacy ordinary responses remain compatible through the default-station adapter; new journey references do not replace a customer's ordinary ticket identifier without a versioned contract.

## Acceptance scenarios

1. **Ordinary queue:** workflow/pilot off; current issue/call/confirm/serve/skip/restore/closure behavior and linked booking outcomes remain stable. Default station does not alter public/mobile links.
2. **Six-stage lab:** Reception → Cashier → Laboratory → Imaging → Cardiology → Results. Each transfer waits for staff-confirmed destination arrival. Results readiness can wait overnight. Intermediate completion never completes the booking; terminal release does exactly once.
3. **Arrival races:** concurrent check-ins and lost-response retries create one entry and one waiting timestamp. Not-ready, wrong station, cancelled journey and unauthorized tenant all fail safely.
4. **Independent stations:** one station's outstanding call/session does not freeze unrelated stations. Journey cannot start two physical stages concurrently.
5. **Four courts:** simultaneous five one-unit starts admit four; explicit two-unit demand respects remaining capacity. Reservation conversion does not double count. Overdue sessions stay allocated until completion/termination.
6. **Protected order:** earlier two-hour demand blocks later one-hour work on that pool before a reservation; independent pools progress. Missing/invalid plan fails visibly.
7. **Cancellation/closure:** pending progression stops, completed history remains, active capacity is unresolved until explicit resolution; queue closure cannot free it or reset the journey.
8. **Version/entitlement races:** concurrent publish/enable/admit pins one committed version; draft edits do not change active visits. Pro expiry blocks new/configuration actions while existing arrival/readiness/recovery/resolution works.
9. **Authorization:** owner/admin distinctions, station-assigned staff, scoped queries/events and revoked membership enforced server-side. Staff retain account security without Administration access; one-seat owner switches without membership changes.
10. **Ledger writers:** concurrent booking/create/reschedule/cancel and session start/extend/complete produce no over-allocation or duplicate consumption. Outbox retries do not repeat transitions/notifications.

Implement focused unit tests for ordering/normalization and interface-level integration tests against an isolated database for transactions, constraints, retries and entitlement races. Browser tests prove supported operator flows and theme/accessibility behavior; source inspection or the synthetic HTML preview cannot replace runtime tests.

## Delivery gates

The first implementation slice is the shared vendor shell over current ordinary location queues, preserving merged arrival/timing/plan controls. No optional-mode activation or prediction change is needed for it. Follow with additive station/schema and compatibility contracts and establish ordinary queue parity; coordinate shared-file changes using the recorded ownership boundaries. Next enable validated configuration and sequential workflow-only pilots after channel and booking completion acceptance. Reuse draft resource configuration, then add ledger protection across all writers before lifting the tracking constraint. Resource-only pilots follow allocation acceptance; combined mode waits for both. No broad activation until expiry booking handling, pilot participants, source access/editor fallback and measurable pilot quality criteria are settled.

This specification adds no price promises, report storage, new clinical rules, automatic resource release or deployment authorization. It defines the reviewable contracts needed before those optional modes operate.

## Proposed internal operational snapshot contract

Owner: this vendor dashboard/runtime workstream. Consumer: AI-owned fail-closed resource readiness/shadow adapter. Proposed identifier `resource-operational-snapshot-v1`; no producer, endpoint or deployed DTO currently exists. Verified fetched main on 7 October 2026 at `61bd298d3c8c482be95740e294cd1cfdf09d3c49` still returns `trackingAvailable: false` and `allocationEnabled: false`, and constrains pool tracking off. Do not synthesize a ready snapshot from draft mappings or service-timing records.

| Proposed field/group | Producer guarantee |
| --- | --- |
| `contractVersion`, `readiness`, reason codes | Explicit compatible version; `not_ready` for unavailable/disabled ledger, incomplete demand, unsupported execution mode, inconsistent data or unsupported scope. An empty array is not evidence of zero occupancy. |
| Scope | Tenant/location and station where applicable resolved server-side; internal adapter checks exact configured scope. Independent developer queues require a separately defined project/environment contract. |
| `observedAt`, ledger/configuration revisions | Server observation time and a coherent committed read of capacities, reservations, allocations and eligible work. Define the revision/watermark across all relevant writers and maximum acceptable age before integration; stale or unverifiable reads fail closed. |
| Pools | Scoped pool identity, active capacity and configuration revision; draft capacity alone cannot authorize operation. |
| Active allocations | Opaque session/work identity, pool, positive units, actual start and unreleased state. Include overdue/interrupted/unresolved indicators; expected end, if known, is labeled forecast. No automatic release or invented actual finish. |
| Protected reservations | Known committed interval, pool, units and binding lifecycle; converted reservations are linked to their allocation and counted once. Scheduled bookings are not evidence of physical occupation. |
| Eligible waiting work | Stable scoped identity/order, applicable priority, station arrival/readiness and earliest-call constraints, frozen executable plan/revision and validated duration/demand. Called work remains distinct from active allocated work. |
| Completeness/diagnostics | Unknown plans, missing mappings, unresolved occupancy, overlapping/conflicting reservations and unsupported composition surfaced explicitly. Runtime availability and forecast readiness are separate: a truthful overdue allocation may still make a forecast unusable. |

The runtime producer reads authoritative committed records through an internal scoped interface. It exposes no customer identity/contact data or browser-supplied occupancy. A public queue snapshot is not that interface. Forecast consumers must not infer release from Called, elapsed service timing, forecast end, cancellation, closed intake or feature shutdown. All occupancy-changing commands and reservation writers must obey the shared ledger locking/binding contract before this producer can report ready.

The AI adapter owns schema/scope/freshness validation, forecast-support checks and baseline fallback. The runtime workstream owns producer implementation, transaction/read consistency and physical allocation semantics. Adapter absence, unknown plans, invalid scope/version, stale data or unsupported disruption must preserve baseline and record a private diagnostic; it must never treat missing allocations as a free pool. No live inference hook is authorized by this proposal.

The [resource ledger prerequisite and schema handoff](resource-ledger-foundation-handoff.md) identifies the concrete booking/reservation transaction prerequisite on main `795722bf` and supplies the proposed versioned JSON Schema for the AI validator. No producer is implemented; tracking remains disabled.
