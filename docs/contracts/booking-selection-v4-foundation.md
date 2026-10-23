# Booking selection V4: inert server foundation

Status: implemented internal capture/validation only. Capability **disabled**. No existing route, booking writer, Queue command, client, schema or runtime is changed. This is not an end-to-end booking release.

## Source and exclusive scope

Base: actual compatible API synchronization commit `1ea804dc1947277061591c38d1d972f84fe1ce18`. Physical worktree: `/Volumes/Storage0/Projects/getprio/web-app/worktrees/booking-v4-foundation-20261023`; branch `codex/booking-v4-foundation-20261023`.

Read coordination instructions `/Volumes/Storage0/Projects/getprio/AGENTS.md`, `/Volumes/Storage0/Projects/getprio/ARCHITECT-GUIDELINES.md`, `/Volumes/Storage0/Projects/getprio/tasks.md`, and checkout AGENTS.md. Four new files only: two bookingSelection*V4 service modules, `backend/tests/bookingSelectionV4Foundation.test.cjs`, and this document. No migrations are introduced or executed.

### Corrected actual pool identity

The earlier booking audit's claim of different Queue tables named `resource_pools`/`resource_members` is incorrect for the authoritative API baseline. Queue and booking use the same `location_resource_pools` and `service_resource_requirements` tables. Queue V4 also uses `resource_pool_members` and `queue_service_policies.configuration`.

Evidence: `queueSelectionCapture.js` catalogData queries; `queueSelectionCaptureV4.js` data queries; `bookingResourceReservationService.js` reserveCreatedBooking/currentProtectedItem; migrations `20261003_add_resource_capacity_foundation.sql`, `20261017_resource_members_and_queue_policies.sql`, `20261017_named_resource_archival.sql` and `20261017_resource_pool_lifecycle.sql`. No equivalence adapter or invented model-version field is needed.

The missing bridge remains real: current booking protection loads legacy booking item quantity/duration and service mapping, does not capture exact named members or independent V4 duration policy/count/selection lineage, and protects at creation rather than the new chosen confirmation boundary. Existing named protected-member uniqueness is global, so it does not support separate future named bookings in non-overlapping intervals. Those facts require a reviewed persistence/lifecycle change, not a different pool rename.

## SELECT schema inventory (source verification only)

All anchors below are in exact base1ea804dc; this is schema-source verification, not execution against PostgreSQL.

| SELECT source | Verified fields and types | Source anchors |
| --- | --- | --- |
| vendor_services s | id BIGSERIAL, tenant_id BIGINT, name TEXT, updated_at TIMESTAMPTZ, is_active BOOLEAN | database/init.sql:1015–1038; migration20260622_add_vendor_services.sql |
| location_services l | tenant_id/location_id/service_id BIGINT, is_active BOOLEAN | database/init.sql:1041–1047; migration20260708_add_location_services.sql |
| store_locations loc | id BIGSERIAL, tenant_id BIGINT, timezone TEXT, is_active BOOLEAN | database/init.sql:943–966; migration20260514_add_store_locations.sql:3–25 |
| service_resource_requirements r | tenant_id/location_id/service_id/pool_id BIGINT; units_required/revision INTEGER | migration20261003_add_resource_capacity_foundation.sql:22–37 |
| location_resource_pools p | id BIGSERIAL, tenant_id/location_id BIGINT; capacity/revision INTEGER, tracking_enabled BOOLEAN; archived_at TIMESTAMPTZ | migration20261003_add_resource_capacity_foundation.sql:5–19;20261017_resource_pool_lifecycle.sql:2–4 |
| queue_service_policies q | tenant_id/location_id/service_id BIGINT, revision BIGINT, configuration JSONB | migration20261017_resource_members_and_queue_policies.sql:37–51;20261017_queue_service_configuration_v4.sql:4–5 |
| resource_pool_members m | id UUID, tenant_id/location_id/pool_id BIGINT, name TEXT, revision BIGINT, is_active BOOLEAN; archived_at TIMESTAMPTZ | migration20261017_resource_members_and_queue_policies.sql:2–12;20261017_named_resource_archival.sql:3–5 |
| store_hours | id BIGSERIAL, location_id BIGINT, weekday INTEGER, opens_at/closes_at TIME, is_closed BOOLEAN | database/init.sql:972–981; migration20260514_add_store_locations.sql:28 onward |
| vendor_availability_exceptions | id BIGSERIAL, tenant_id/location_id/service_id BIGINT, exception_date DATE | migration20260622_add_vendor_availability.sql:22–42 |
| vendor_availability_blocks | id BIGSERIAL, tenant_id/location_id/service_id BIGINT, is_active BOOLEAN | migration20260622_add_vendor_availability.sql:3–20 |

IDs/PG BIGINT policy and member revisions are explicitly cast ::text in SELECT; INTEGER capacity/units/pool and requirement revisions remain JS numbers, then captured revision values are strings. UUID member identity is read ::text; dates use explicit $4::date[] and interval timestamps become canonical ISO strings. Clock is actual database clock_timestamp() TIMESTAMPTZ. Hours TIME is read ::text and aliased into the existing evaluator shape. Booleans and JSONB retain PG decoded types. Tenant/location/member binding is in every relevant join and WHERE; store_hours uses the location identity already authorized and matched in the first SELECT. No public request can supply server scope or lineage. No tables named resource_pools/resource_members are queried. Actual SQL execution and transaction snapshot/lock behavior remain UNTESTED.

## Functional contract

Input uses the existing Queue V4 service/resource selection shape, explicitly wrapped with `contractVersion:4` and an ISO scheduledStartAt with an explicit offset:

```
{
  contractVersion: 4,
  scheduledStartAt: "2026-11-02T01:00:00Z",
  selections: [{
    serviceSelectionId: "root", serviceId: "11",
    resources: [{ resourceSelectionId: "leaf", resourceMemberId: "<UUID>",
      quantity: 1, durationCount: 2, durationPolicyRevision: "3", extras: [] }]
  }]
}
```

One root, one exact named member, quantity one, no selected or required extras. Pooled/automatic, multiple roots/resources/units and additional/derived client fields are rejected explicitly. Duration is independent of quantity. Existing `queueServicePolicyV4.configuration` and `duration` own base/min/max/step/fixed validation and accepted revision checks. An optional configured extra does not force selection; required extras make this first slice unsupported.

`captureBookingSelectionV4(client, scope, input, lineage)` is INTERNAL. Its client must already belong to an authorized location-first transaction. It performs SELECTs only; it neither authorizes an actor nor acquires a location lock nor opens/commits/rolls back a transaction. Tenant/location/service/member joins, active flags, tracking, archival, and authoritative policy data are read from actual tables. Scope and booking/item lineage come from trusted server authorization/domain state, never customer claims.

The result is a deeply frozen value with `reservationState:"not_created"`, exact service/resource selection IDs, booking/item lineage, scoped pool/member identity and revisions, policy/base/count/duration, scheduled UTC interval, location zone/business date and hours snapshot. It is an immutable in-memory **capture candidate**, not durable protection, confirmation, availability proof, permission or a reservation receipt. Caller must not persist it as confirmed without the future transactional protection writer.

The future scheduled interval is evaluated from scheduledStartAt, not the current walk-in preview; only future-ness uses database `clock_timestamp()` after the caller's branch lock. The existing `queueDayTime` evaluator handles weekly, split and overnight intervals in the location zone; exact closing equality is accepted, a gap cannot be crossed. Duration crossing multiple intervals is unsupported.

Exceptions: any applicable vendor availability exception on the scheduled/end/previous local date fails closed. Any active location/service availability block also fails closed (conservative even on a different weekday). Those scheduling rules are not interpreted by this slice; no claim of full availability/exception support is made. An invalid or missing location zone fails closed. Existing DST helper behavior is reused; ambiguous local-time policy still needs full booking acceptance before activation.

`assessConfirmedHours` only inspects a previously accepted capture using newly read hours. Conflict, unsupported schedules or unverifiable hours return `needs_staff_resolution` and `reservationDisposition:"retain"`; fitting returns `fits` with the same retain disposition. It never changes selections/count, cancels, shortens, releases, or mutates input. A past scheduled end never causes release. This does not itself write a staff flag or prove a persisted reservation survives; that belongs to the integration writer.

`capabilities()` returns enabled:false and confirmation:false. `assertConfirmationEnabled()` always rejects. No environment flag or route activation is added. `publicSelection` explicitly projects names, scheduled start/end and duration/count only: no member/pool IDs, lineage, catalog/policy revisions, ledger identifiers or permission claims. It is a display projection, not an availability endpoint.

## Required atomic confirmation writer — BLOCKED, deliberately absent

Human decisions: capacity becomes guaranteed on **booking confirmation**; payment holds have independent expiry. An hours change that invalidates a confirmed booking requires staff reschedule/cancel and retains its reservation. Exact named choice guarantees that member; no automatic substitute.

A later authorized integration must implement these together before enabling capability:

1. Use the existing `resourceLedger.with...` scoped transaction discipline: BEGIN, all affected `store_locations` rows locked in ascending ID order (`FOR UPDATE` or reviewed `FOR NO KEY UPDATE`), authorize tenant/branch/actor on that client, then booking/item/domain rows in deterministic order. Revalidate maintenance, actual entitlements, payment/admission policy, booking state and optimistic revisions after locks. This capture loader does not replace those guards.
2. Load current mapping/policy/member/hours through this read adapter under that same transaction. Validate scheduled interval independently of current queue intake. Persist the immutable captured selection lineage plus authoritative revisions; do not reconstruct an old capture from edited configuration.
3. Add interval-aware **exact member** protection participating with every Queue/booking reservation/start/release/config writer. Half-open intervals allow adjacent bookings; overlap conflicts; actual unreleased occupancy blocks admission regardless of expected finish. Existing unbound legacy pooled protections must conservatively count or fail reconciliation rather than disappear. Global named uniqueness cannot simply be removed without equivalent scheduled/actual conflict guards. A schema review, migration and matching lifecycle writers are prerequisites.
4. Confirmation, captured selection, exact-member reservation, booking revision/allowance/audit, and idempotent operation receipt must commit in one transaction. Scope operation key to tenant/location/booking + command; same key/same normalized payload replays original result; same key/different payload conflicts. On any guard/SQL/audit/allowance failure, rollback all effects. Unknown commit results retry using the same key; they never create a second reservation.
5. No Queue ticket or Queue hold at create or confirmation. Check-in later creates exactly one linked V4 plan; Call must respect not-before-start; explicit Start transfers self-owned future protection to occupancy atomically without double capacity. All are separate blocked bridge work, not implemented here.
6. Pending payment hold expiry never releases confirmed service protection. Staff reschedule/cancel uses the immutable owned binding, locks before replacement, and rolls back on conflict. Edited hours or elapsed expected end never release it. Complete/interruption/recovery/no-show/queue close each need explicit owned-only outcomes and exactly-once booking state updates.
7. Preserve legacy booking quantity/capture/read semantics. Never relabel historical V1/V2/V3 as this V4. Run original queue regression and booking concurrency/rollback/adjacent/overlap/replay/permissions/MFA/Free-Pro/SSE cases against an isolated actual-schema DB before capability activation.

No transaction writer is supplied because safely changing these participating shared writers exceeds the approved four-file scope. There is no fake repository, simulated atomic confirmation or test that claims otherwise. Consumer/Queue bridge work remains blocked by the no-merge prerequisite integration gate.

## Verification and limits

Red: the new focused suite first failed because the new contract module did not exist (`MODULE_NOT_FOUND`, exit1). Green: 15 focused cases pass, including scope/member/policy/count/time/unsupported input, exact capture immutability/public field allowlist, SQL parameter boundaries, failure-closed schedules, and retain-only hours assessment. Existing policy and effective-time neighbors add 10 cases, total25 PASS.

The adapter's database client is a deterministic SELECT-response fixture in unit tests. SQL contract assertions establish intended parameterized joins and no mutation statements, **not actual PostgreSQL execution, locks, authorization, capacity, reservation races, rollback, idempotency, durable immutability or schema integration**. Those runtime cases are UNTESTED. Writer/consumer integration is BLOCKED. No network/provider/DB call occurs in these tests; no retained fixtures are changed. JavaScript syntax checks PASS. Backend build attempted and BLOCKED: this isolated checkout has no installed TypeScript compiler (`tsc: command not found`, exit127). No dependency install or lockfile change was performed.
