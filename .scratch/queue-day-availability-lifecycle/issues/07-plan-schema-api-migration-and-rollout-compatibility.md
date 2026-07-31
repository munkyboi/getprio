# Plan schema, API, migration, and rollout compatibility

Type: task
Status: resolved
Claimed by:
Blocked by: 01, 03, 04, 06

## Question

What is the smallest safe additive schema and API rollout that introduces explicit Queue Day opening, warning, extension, auto-close, expiration, and reconciliation without corrupting existing closures, pauses, tickets, bookings, snapshots, or clients?

## Required asset

Create `../assets/07-schema-api-rollout-cutline.md` with migrations, backfills, compatibility contracts, implementation slices, deployment ordering, rollback limits, and verification gates.

## Resolution must decide

1. Queue Day record/state schema and whether existing closure/pause records are retained, migrated, or replaced.
2. Ticket status/reason additions, carry-over lineage, deadline fields, and legacy-row backfill rules.
3. Snapshot and mutation API compatibility for public, customer, vendor, SSE, and shared types.
4. Safe handling of already-stale production rows and ambiguous historical carry-over counts.
5. Ordered backend/frontend deployment and rollback strategy.

## Resolution

The implementation cutline is captured in
[`../assets/07-schema-api-rollout-cutline.md`](../assets/07-schema-api-rollout-cutline.md).

The smallest safe rollout is additive and staged. A new `queue_days` aggregate
eventually owns lifecycle, intake, snapshotted hours/timezone, deadlines,
versions, and daily sequence allocation. Existing closure/pause tables, ticket
identity columns, and event history remain intact through a per-location
`legacy -> shadow -> enforced` transition.

Ticket roots gain explicit pending carry-over/expiration state and Queue
Day-specific display-number segments. Queue events gain deterministic keys and
before/after state, notification intent moves to a transactional outbox, Staff
location assignment becomes explicit without revoking legacy access, and paid
ticket issuance binds to the Queue Day that accepted checkout.

Public, customer, vendor, SSE, and shared contracts expand additively while
retaining existing aliases and routes. Stale/ambiguous rows are preserved,
classified, and either reconciled by the real lifecycle engine or quarantined
for reviewed repair; migration never silently cancels, deletes, or finalizes
them.

Schema expansion and a compatibility release precede resumable backfill and
shadow comparison. Enforcement is enabled only after verification and
production UI readiness. After new lifecycle-only statuses are written,
rollback is forward-only or returns to the compatibility release—not to a
pre-expansion backend or a destructive database downgrade.
