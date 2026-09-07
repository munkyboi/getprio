# Reliable queue-day availability and stale-ticket lifecycle

Label: wayfinder:map

## Destination

Implement and verify a location-timezone-aware Queue Day lifecycle in which staff manually open during effective store hours, customers can join only while the Queue Day is open and inside its effective queue operating window, staff receive a prototype-validated 15-minute auto-close warning with audited 30-minute extensions, overdue days reconcile reliably, and every unresolved ticket reaches a deterministic carry-over, expiration, completion, or unserved outcome without stale records.

The map is complete only when the database, backend, vendor/customer UI, notifications, audit trail, migration, tests, smoke coverage, and operating documentation are implemented and verified.

## Notes

Domain: GetPrio store hours, Queue Days, queue availability, ticket lifecycle, vendor operations, customer joins, notifications, and auditability. Consult `AGENTS.md` and `CONTEXT.md` in every resolving session.

Skills every resolving session should consult:

- `/grilling`
- `/domain-modeling`

Use `/prototype` when resolving **Prototype the queue auto-close warning and extension controls**.

This effort explicitly carries execution inside the map. Resolve decision and research tickets first, then implement through the blocked task tickets. Never resolve more than one ticket in one Wayfinder session.

Standing direction agreed during charting:

- Store-hours eligibility and Queue Day availability are separate facts.
- Every eligible Queue Day starts unopened and requires an authorized vendor-side user to open it during effective store hours.
- Entering store hours never opens the queue automatically.
- Auto-close uses a periodic scan, a startup scan, and request-time reconciliation backed by one idempotent database transition.
- Staff receive a prominent danger-state warning and countdown 15 minutes before auto-close.
- Each explicit cancellation of the current auto-close grants one audited 30-minute extension and schedules a fresh warning; it never disables auto-close indefinitely.
- An unresolved waiting ticket may carry into one next eligible open Queue Day only.
- A carried-over ticket still unresolved when that Queue Day closes becomes `expired`, not `cancelled`.
- Closed store days do not consume the ticket's one carry-over opportunity.
- A system expiration must notify the customer and remain auditable.
- The changed UI remains mobile-first and follows the repository modal/accessibility standards where dialogs are used.

## Decisions so far

- [Current queue availability and stale-ticket audit](./issues/01-audit-current-queue-availability-and-stale-ticket-failure-modes.md) — current “open” is inferred from absent closure/pause rows, availability enforcement and date ownership diverge across entry paths, and unresolved prior-day tickets can become invisible; the target must use an explicit location-timezone Queue Day, database-idempotent reconciliation, deterministic outcomes, and durable lifecycle notification intent.
- [Define the Queue Day state and effective-hours contract](./issues/02-define-the-queue-day-state-and-effective-hours-contract.md) — use a three-state `unopened/open/closed` lifecycle with orthogonal intake and auto-close conditions, opening-time hours/timezone snapshots, repeatable audited extensions, restricted in-hours reopen, authoritative deadlines, and carry-over attachment to the first later Queue Day staff actually open.
- [Define ticket outcomes at close and reconciliation](./issues/03-define-ticket-outcomes-at-close-and-reconciliation.md) — first-close waiting becomes seven-day-bounded `pending_carry_over`, carried waiting expires, called becomes unserved, skipped recovery ends, terminal outcomes survive reopen, booking-linked tickets resolve to completed/unfulfilled/missed, and one cross-day history drives durable transition notifications.
- [Design idempotent auto-close and stale-day reconciliation](./issues/04-design-idempotent-auto-close-and-stale-day-reconciliation.md) — serialize every mutation on one PostgreSQL Queue Day row, commit ticket outcomes/events/outbox intents atomically, run bounded periodic/startup/request reconcilers safely on every instance, and treat external delivery as durable-intent at-least-once.
- [Prototype the queue auto-close warning and extension controls](./issues/05-prototype-the-queue-auto-close-warning-and-extension-controls.md) — use the selected global action tray across vendor dashboard sections, opening a focused desktop modal/mobile bottom sheet for consequences, audited 30-minute extension, manual close, and trustworthy lifecycle recovery states.
- [Define queue availability permissions, notifications, and audit](./issues/06-define-queue-availability-permissions-notifications-and-audit.md) — scope routine operation to assigned Vendor Staff and Vendor Admin/Owner, reserve narrowly audited repair for Platform Admin, deliver deadline-versioned staff alerts and truthful customer messages, and preserve immutable lifecycle evidence.
- [Plan schema, API, migration, and rollout compatibility](./issues/07-plan-schema-api-migration-and-rollout-compatibility.md) — add an authoritative Queue Day aggregate behind a per-location legacy/shadow/enforced cutover, preserve legacy history and additive API aliases, backfill stale rows without silent outcomes, and treat rollback as forward-only after new lifecycle states are written.
- [Implement Queue Day lifecycle and reconciliation backend](./issues/08-implement-queue-day-lifecycle-and-reconciliation-backend.md) — implemented the additive Queue Day aggregate, deterministic close outcomes, one-time carry-over, timezone-aware manual open and 30-minute extensions, deadline-versioned warnings, durable notification outbox, assigned-location permissions, and idempotent periodic/startup/request reconciliation; verified with 332 backend tests and live PostgreSQL migration, backfill, lifecycle, and outbox smoke coverage without changing the storefront UI.
- [Implement queue availability UX and notifications](./issues/09-implement-queue-availability-ux-and-notifications.md) — implemented the selected global warning tray and mobile-first task modal, manual open/reopen and close controls, repeated 15-minute warnings with audited 30-minute extensions, deterministic consequence/outcome messaging, authoritative public/customer availability copy, and location-scoped durable notifications; verified with 334 backend tests, 88 frontend tests, typecheck, lint, production build, and live mobile/desktop browser QA while leaving storefront structure unchanged.
- [Verify rollout, operations, and stale-ticket recovery](./issues/10-verify-rollout-operations-and-stale-ticket-recovery.md) — proved the lifecycle and legacy backfill on a disposable database, extended role-aware headless smoke, corrected recovery/reconnect/deployment-tooling defects found during rehearsal, documented staged rollout and forward-only rollback, and verified 339 backend tests, 100 frontend tests, all builds/typechecks, live role smoke, and prior mobile/desktop accessibility evidence.

## Not yet specified

- Nothing remains unspecified for this destination.

## Out of scope

- Redesigning booking scheduling, booking check-in priority, service workflows, or multi-counter routing except where compatibility with Queue Day closure requires it.
- Redesigning the AI ETA model; lifecycle events may be preserved for future ETA inputs.
- Allowing customers to open, reopen, or extend a Queue Day.
- Automatically opening a queue merely because store hours have begun.
- Replacing the existing notification stack or introducing unrelated messaging channels.
- Redesigning vendor storefront, discovery/profile, service presentation, or booking UI; only existing queue-status copy and join affordances change where required to represent authoritative Queue Day availability.
- Advanced lifecycle analytics, a broader holiday/temporary-closure product
  surface, and extracting reconciliation into dedicated infrastructure remain
  future scale/product enhancements rather than correctness requirements for
  this completed MVP lifecycle.
