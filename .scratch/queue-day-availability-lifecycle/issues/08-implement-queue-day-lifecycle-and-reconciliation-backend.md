# Implement Queue Day lifecycle and reconciliation backend

Type: task
Status: resolved
Claimed by: Codex (/root)
Blocked by: 07

## Question

Implement the approved database, repository, service, route, event, notification, and reconciliation behavior for explicit Queue Days and deterministic ticket outcomes.

## Completion requirements

1. Apply the approved additive migrations and backfills.
2. Implement server-enforced manual opening, state transitions, effective-hours validation, warning deadlines, extensions, atomic closing/reconciliation, and finalization without adding a persistent draining state.
3. Implement periodic, startup, and request-time reconciliation with concurrency-safe idempotency.
4. Implement one-time carry-over, expiration, stale-day repair, notification idempotency, and auditable event reasons.
5. Preserve booking-ticket linkage, queue ordering, pause/capacity behavior, SSE snapshots, and role authorization.
6. Add focused repository, service, route, concurrency, timezone, restart, and migration tests.

## Resolution

Implemented the Queue Day backend as an additive, per-location lifecycle behind
`legacy`, `shadow`, and `enforced` rollout modes:

- Added the authoritative `queue_days` aggregate, lifecycle events, durable
  notification outbox, ticket journey segments, booking outcomes, payment
  binding, staff location assignments, and resumable anomaly-preserving
  backfill support.
- Added timezone-aware effective-hours resolution, manual open and audited
  30-minute extension commands, deadline-versioned 15-minute and 5-minute
  warnings, and one concurrency-safe close/reconciliation command shared by
  periodic, startup, and request-time recovery.
- Added deterministic close outcomes: first-time waiting tickets become
  `pending_carry_over`, carried tickets become `expired`, called tickets become
  `unserved`, and booking-linked tickets receive explicit fulfillment outcomes.
  Reopening never reverses those results.
- Added one-time carry-over activation on a later eligible manually opened Queue
  Day, seven-calendar-day pending expiry, safe paid-callback handling after
  closure, assigned-location authorization, platform diagnostics/repair, and
  outbox delivery leasing and idempotency.
- Preserved existing queue ordering, pause/capacity behavior, additive API
  compatibility, and public snapshot shape. No storefront UI was changed.

Verification:

- Backend tests: 332 passed, 0 failed.
- Focused lifecycle/repository/route tests: 59 passed, 0 failed.
- Frontend, platform, and backend TypeScript checks passed.
- ESLint completed with 0 errors and 2 pre-existing/prototype warnings.
- `git diff --check` passed.
- All four migrations applied to local PostgreSQL; the schema verifier passed.
- The resumable backfill completed twice without anomalies on the current
  fixture database.
- Live PostgreSQL smoke coverage verified atomic close outcomes, outcome
  stability after reopen, carry-over activation and later expiry, exact
  30-minute extension behavior, warning idempotency, durable outbox dispatch,
  and complete cleanup of temporary smoke tenants.
