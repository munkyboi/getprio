# Design idempotent auto-close and stale-day reconciliation

Type: research
Status: resolved
Claimed by:
Blocked by: 02, 03

## Question

How should GetPrio execute warning, auto-close, extension, ticket finalization,
pending-carry-over expiry, and missed-day reconciliation safely across periodic
scans, startup, request-time guards, crashes, retries, and multiple backend
instances?

## Known direction

- Use a hybrid periodic, startup, and request-time reconciliation model.
- PostgreSQL must be the authority and the transition must be idempotent.
- Location timezone and effective hours determine deadlines.
- There is no draining Queue Day state. Close atomically applies the resolved
  ticket outcome matrix.
- `pending_carry_over` expires after seven calendar days if no later Queue Day
  opens.

## Required asset

Create `../assets/04-auto-close-reconciliation-design.md` containing the execution sequence, transaction/locking strategy, retry behavior, query bounds, failure handling, and deployment assumptions.

## Resolution must decide

1. The durable records and deadlines needed for warning, extension, closing,
   ticket finalization, and pending-carry-over expiry.
2. How concurrent reconcilers claim work and prevent duplicate carry-over, expiration, events, or notifications.
3. Scan cadence, startup behavior, request-time reconciliation boundaries, and bounded query strategy.
4. Recovery after downtime spanning one or more local dates.
5. Notification outbox/idempotency behavior when database mutation succeeds but delivery fails.

## Resolution

The design is captured in
[`../assets/04-auto-close-reconciliation-design.md`](../assets/04-auto-close-reconciliation-design.md).

The authoritative boundary is one locked Queue Day aggregate row. Every queue
mutation and every periodic/startup/request reconciliation attempt locks and
rechecks that row before changing tickets. Close, ticket/booking outcomes,
unique audit events, and durable notification intents commit atomically.

Scans run on every backend instance using bounded `FOR UPDATE SKIP LOCKED`
claims; no process leader is required. Warning intents are keyed by deadline
version, extensions invalidate the old warning version, overdue deadlines
close regardless of worker delay, and pending carry-over expiry is a separate
ticket-scoped claim.

External delivery uses a transactional outbox with one durable intent and
at-least-once provider delivery. Startup closes old persisted Queue Days and
expires due pending carry-over without inventing intermediate dates. Requests
reconcile only their resolved location/ticket scope and fail closed when state
cannot be settled safely.
