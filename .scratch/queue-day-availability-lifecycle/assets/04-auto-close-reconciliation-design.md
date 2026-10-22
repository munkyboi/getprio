# Auto-close and stale-day reconciliation design

Date: 2026-07-30
Status: decision-ready design for the backend implementation and migration tickets.

## Decision summary

PostgreSQL owns Queue Day truth. Periodic scans, startup recovery, manual
requests, payment activation, and request-time guards may all attempt the same
transition, but none owns time or state in process memory.

Every Queue Day mutation:

1. resolves the location and business date using the location-timezone policy;
2. starts a database transaction;
3. creates/resolves and locks the authoritative Queue Day row;
4. rechecks state and deadline using database time;
5. conditionally applies exactly one state transition and ticket outcome set;
6. inserts immutable queue events and unique notification intents in the same
   transaction; and
7. commits before publishing SSE or contacting an external provider.

The transition is idempotent. Repeating it returns the already-current state
without moving tickets, rewriting outcomes, or creating duplicate events or
notification intents.

## Current seams the implementation must replace

- [`queueService.js`](../../../backend/src/services/queueService.js) currently
  checks for a closure and reads affected tickets without locking a Queue Day
  aggregate. Concurrent close/call/join requests can disagree.
- [`queueDayClosures.js`](../../../backend/src/repositories/queueDayClosures.js)
  stores closure history but cannot represent unopened/open state, deadlines,
  warning versions, or extension history.
- [`server.ts`](../../../backend/src/server.ts) has one process timer for
  organizer campaigns and no Queue Day startup or periodic reconciliation.
- [`pushNotificationService.js`](../../../backend/src/services/pushNotificationService.js)
  deduplicates with a process-local two-minute map and sends after commit.
- [`notification_deliveries`](../../../database/init.sql) records only email/SMS
  results after delivery; it is not a transactional outbox and has no
  idempotency key.
- Queue SSE is a process-local `EventEmitter` in
  [`queueEvents.js`](../../../backend/src/services/queueEvents.js). It remains a
  refresh hint, not lifecycle truth or durable delivery.
- The documented MVP is currently one backend process on one droplet, but PM2
  restart, a second process, or a rolling deployment must not duplicate work.
  See [`mvp-deployment-guide.md`](../../../docs/plan/mvp-deployment-guide.md).

## Durable records

### Queue Day aggregate

Introduce one authoritative `queue_days` row per tenant, location, and local
business date:

| Field | Purpose |
| --- | --- |
| `id` | Stable aggregate identity used by tickets, events, locks, and outbox keys. |
| `tenant_id`, `location_id`, `business_date` | Unique Queue Day scope. |
| `state` | `open` or `closed` for persisted rows. Absence derives `unopened` before interval end and `closed/not_opened` afterward. |
| `intake_mode` | `accepting` or `paused` while open. |
| `timezone_snapshot` | IANA timezone captured at opening. |
| `effective_opens_at`, `scheduled_closes_at` | Opening-time effective-hours snapshot as absolute instants. |
| `current_closes_at` | Authoritative deadline after extensions. |
| `deadline_version` | Starts at 1 and increments for every extension; scopes warning and outbox idempotency. |
| `extension_count` | Auditable total; does not replace extension events. |
| `opened_at`, `opened_by_user_id` | Manual opening actor and time. |
| `closed_at`, `closed_by_user_id` | Actual transition time and optional human actor. |
| `close_reason`, `close_source` | Domain reason separate from manual/deadline/periodic/startup/request source. |
| `reopened_at`, `reopened_by_user_id`, `reopen_count` | Restricted early-manual-close recovery history. |
| `version` | Incremented on every aggregate mutation for API conflict detection and event keys. |
| `created_at`, `updated_at` | Record lifecycle timestamps. |

Use a full unique constraint on
`(tenant_id, location_id, business_date)`. Do not model closure by creating a
new row on every reopen; reopen mutates the one Queue Day aggregate and adds an
immutable event.

An unopened date does not require a row. Before its effective interval ends,
absence is exposed as `unopened`; after it ends, absence is exposed as
`closed/not_opened`. Persisting every empty eligible date is unnecessary for
correctness and would make scans depend on synthetic rows. If later analytics
need missed-opening facts, they can materialize derived audit records without
changing Queue Day semantics.

### Ticket lifecycle additions

The schema/API ticket should represent:

- explicit `pending_carry_over` and `expired` statuses;
- stable `origin_queue_day_id`;
- nullable `current_queue_day_id` (`NULL` while pending carry-over);
- `carry_over_expires_at`, computed once from the original close and location
  timezone as seven local calendar days;
- `carried_over_at`, `activated_from_carry_over_at`, and `expired_at`;
- outcome `reason` and immutable original/final display-number history;
- optional `replacement_for_ticket_id`;
- a fresh sequence/display number allocated when carry-over activates.

The existing `date_key`/`queue_date_key` ambiguity must not remain the ownership
boundary. Queue Day foreign keys establish identity; denormalized date fields,
if retained for compatibility, are projections.

### Queue events

Retain the existing scoped `queue_events` concept, but add a non-null unique
`event_key`. Generate it deterministically from the transition:

```text
queue-day:<queue_day_id>:version:<version>:<event_type>
ticket:<ticket_id>:transition:<from>:<to>:queue-day:<queue_day_id>
ticket:<ticket_id>:pending-expiry:<carry_over_expires_at>
```

`INSERT ... ON CONFLICT (event_key) DO NOTHING` is the last defense against a
retry creating duplicate audit history. Event metadata holds prior/new
deadlines, display numbers, outcome reason, actor, source, and linked booking
effects. Optional staff text remains separate from reason/source.

### Notification outbox

Add a durable outbox rather than treating `notification_deliveries` as intent:

| Field | Purpose |
| --- | --- |
| `id`, `idempotency_key UNIQUE` | One logical recipient/channel intent per transition. |
| `event_id` | Links delivery to immutable queue event. |
| `tenant_id`, `ticket_id`, `queue_day_id` | Scope and audit lookup. |
| `recipient_key`, `channel` | Stable recipient identity and push/email/SMS channel. |
| `template`, `payload` | Versioned rendering input, excluding secrets. |
| `aggregate_version`, `deadline_version` | Makes warning obsolescence checkable. |
| `status` | `pending`, `processing`, `sent`, `retry`, `dead`, or `obsolete`. |
| `available_at`, `expires_at` | Retry schedule and time-sensitive cutoff. |
| `attempt_count`, `locked_at`, `locked_by` | Lease/recovery fields. |
| `last_error`, `sent_at`, timestamps | Operations evidence. |

The lifecycle transaction inserts outbox rows with deterministic keys such as:

```text
queue-warning:<queue_day_id>:deadline:<deadline_version>:<recipient>:<channel>
ticket:<ticket_id>:pending-carry-over:<event_id>:<recipient>:<channel>
ticket:<ticket_id>:carry-over-activated:<event_id>:<recipient>:<channel>
ticket:<ticket_id>:expired:<event_id>:<recipient>:<channel>
```

There is exactly one durable intent. External delivery remains at-least-once:
if a provider accepts a request and the process dies before marking `sent`, a
retry can duplicate unless that provider supports an idempotency key. Pass the
stable outbox key to providers that support one; use a stable Web Push tag and
provider/message metadata elsewhere. Do not claim exactly-once delivery.

## Locking and transaction discipline

### The Queue Day row is the mutex

All mutations for an open Queue Day acquire:

```sql
SELECT *
FROM queue_days
WHERE id = $1
FOR UPDATE;
```

This applies to:

- close/reconcile and restricted reopen;
- call, serve, skip, cancel, and restore;
- customer join, vendor walk-in, and booking check-in;
- paid-payment ticket activation;
- pause/resume and extension; and
- carry-over activation during open.

The queue-day lock is acquired before ticket rows. Ticket rows are locked in
ascending ID order. No external network call occurs while locks are held.

Opening races are serialized by:

1. inserting the `(tenant, location, business_date)` row with
   `ON CONFLICT DO NOTHING`;
2. selecting that row `FOR UPDATE`; and
3. rechecking whether it is still eligible for the requested open/reopen.

This avoids a separate advisory-lock key and gives the aggregate one visible,
inspectable lock. PostgreSQL advisory locks remain unnecessary for this slice.

Paid activation retains payment-row idempotency: lock the payment first, then
the Queue Day, then create the ticket. No other flow may take those locks in
the reverse order.

### Conditional state changes

Every transition checks the locked row again:

- close succeeds only from `open` when manual close is authorized or
  `current_closes_at <= transaction database time`;
- extension succeeds only from `open`, during the current 15-minute warning,
  and strictly before `current_closes_at`;
- pause/resume and ticket intake succeed only from `open` and strictly before
  the deadline;
- restricted reopen succeeds only when the last close source was an early
  manual close and database time remains inside the snapshotted interval and
  before the current deadline.

If the desired state is already present, return the current aggregate as an
idempotent no-op. A client-supplied expected `version` may produce `409 state
changed` for interactive controls, but retrying the underlying command remains
safe.

### Close transaction

Under the locked Queue Day row:

1. Recheck state/deadline and determine `reason` and `source`.
2. Lock all nonterminal tickets currently attached to the Queue Day, ordered by
   ID.
3. Apply the resolved matrix:
   - first-day waiting to `pending_carry_over`, clear `current_queue_day_id`,
     and set `carry_over_expires_at`;
   - carried waiting to `expired`;
   - called to `unserved`;
   - skipped remains skipped but receives terminal recovery metadata;
   - existing terminal rows remain unchanged.
4. Update linked bookings to `unfulfilled` or `missed` where required.
5. End any active intake pause.
6. Update Queue Day to `closed`, increment `version`, and record reason/source.
7. Insert one Queue Day event and per-ticket/per-booking events with unique
   keys.
8. Insert notification outbox intents with unique keys.
9. Commit.

There is no ticket notification or SSE publication inside the transaction.

### Carry-over activation transaction

Opening a Queue Day locks its aggregate before accepting new joins. It then:

1. selects this tenant/location's `pending_carry_over` tickets whose
   `carry_over_expires_at > database time`, ordered by original close/join and
   ticket ID, `FOR UPDATE`;
2. allocates fresh daily sequences under the same Queue Day counter/lock;
3. changes each to `waiting`, attaches `current_queue_day_id`, marks one
   carry-over consumed, and assigns carry-over priority;
4. inserts activation events and notification intents; and
5. commits the open plus activation before any ordinary join can lock the Queue
   Day.

Pending cancellation locks the ticket. Activation and cancellation both
recheck status after locking, so exactly one wins.

### Pending-carry-over expiry transaction

Expiry is ticket-scoped and independent of a currently open Queue Day. A worker
claims due rows using:

```sql
SELECT id
FROM tickets
WHERE status = 'pending_carry_over'
  AND carry_over_expires_at <= NOW()
ORDER BY carry_over_expires_at, id
FOR UPDATE SKIP LOCKED
LIMIT $batch_size;
```

For each still-due ticket, change it to `expired`, update a linked booking to
`unfulfilled`, insert unique events/intents, and commit. A simultaneous Queue
Day opening selects only non-expired rows and rechecks under the same ticket
lock; the deadline boundary and row lock determine one winner.

## Reconciliation entry points

All three entry points call the same domain commands. They do not contain
separate close logic.

### Periodic scan

Run on every backend instance:

- every 30 seconds, with small per-process jitter;
- process at most 25 Queue Day transitions per pass;
- process at most 100 pending-carry-over expirations per pass;
- order oldest due deadline first;
- loop one short transaction per claimed Queue Day so one busy location does
  not hold locks for an entire batch.

Candidate queries are indexed on `(state, current_closes_at)` and pending
tickets on `(status, carry_over_expires_at)`. `FOR UPDATE SKIP LOCKED` allows
multiple instances to share work without leader election.

The same pass handles:

- warning intent due at `current_closes_at - 15 minutes`;
- Queue Day close due at `current_closes_at`;
- seven-day pending expiry.

Warnings are keyed by `deadline_version`. Extension increments that version,
marks unsent old warnings obsolete, and schedules a new warning. A worker that
wakes after the deadline skips stale warning intent and closes instead.

### Startup scan

After database connection and before the process reports healthy:

1. run a bounded pass of up to 100 overdue Queue Days and 500 due pending
   expirations, oldest first;
2. do not contact providers synchronously—the outbox dispatcher handles that;
3. log remaining backlog count and oldest age; and
4. start normal periodic passes immediately if backlog remains.

Startup is allowed to continue after the bounded pass rather than blocking
indefinitely. Correctness is still protected by request-time guards.

### Request-time reconciliation

Before any queue mutation, lock/resolve the target Queue Day and reconcile it
if overdue. The requested mutation then evaluates the resulting state.

Also reconcile the single resolved location scope before returning:

- public/customer queue snapshots;
- vendor queue dashboard snapshots; and
- paid-payment activation/sync that could issue or expose a ticket.

Do not run an unbounded tenant/global scan from a request. A request only
reconciles the location/Queue Day or ticket it already addresses. Public vendor
search does not trigger queue lifecycle work.

If lock contention or a retryable database error prevents the guard from
settling state after bounded retries, reject a mutation with a retryable
service-unavailable/state-changed response. Never proceed against a possibly
overdue Queue Day.

## Warning and extension sequence

```mermaid
sequenceDiagram
  participant Scan as Any reconciler
  participant DB as PostgreSQL
  participant Outbox as Outbox dispatcher
  participant Staff as Vendor staff UI

  Scan->>DB: Lock open Queue Day
  DB-->>Scan: Deadline version N in warning window
  Scan->>DB: Insert warning event + intents (unique N)
  Scan->>DB: Commit
  Outbox->>DB: Claim intents with SKIP LOCKED
  Outbox-->>Staff: Warning notification
  Staff->>DB: Extend with expected version
  DB->>DB: Lock Queue Day, verify warning and time < deadline
  DB->>DB: current deadline += 30m, deadline version N+1
  DB->>DB: Mark unsent warning N obsolete; insert extension event
  DB-->>Staff: Commit new deadline
```

The visible countdown is calculated from server-provided absolute deadline and
current server time; it does not wait for warning delivery.

## Close/reconciliation sequence

```mermaid
sequenceDiagram
  participant Trigger as Timer/startup/request/manual
  participant DB as PostgreSQL
  participant Dispatch as Outbox dispatcher
  participant Client as SSE/polling client

  Trigger->>DB: Begin; lock Queue Day
  DB-->>Trigger: Open and close is authorized/due
  Trigger->>DB: Lock attached nonterminal tickets
  Trigger->>DB: Apply ticket + booking outcomes
  Trigger->>DB: Close Queue Day; insert unique events/intents
  Trigger->>DB: Commit
  Trigger-->>Client: Best-effort refresh signal
  Dispatch->>DB: Claim pending intents
  Dispatch->>Dispatch: Send externally outside lifecycle transaction
  Dispatch->>DB: Record sent/retry/dead result
```

## Retry and failure behavior

### Database operations

- Retry serialization failures, deadlocks, and transient connection errors up
  to three times with jittered backoff.
- Use short transactions and a bounded lock timeout. Request paths fail closed
  if the Queue Day cannot be reconciled.
- Never retry validation/authorization conflicts as database failures.
- A crash before commit changes nothing. A crash after commit is recovered by
  the outbox and fresh snapshot reads.
- Event and outbox unique keys make a retry after an ambiguous connection
  result safe.

### Outbox dispatcher

- Poll every 5 seconds on every instance.
- Claim up to 50 due rows with `FOR UPDATE SKIP LOCKED`, set a lease owner/time,
  and commit before external sends.
- Reclaim `processing` rows whose lease is older than 5 minutes.
- Suggested backoff: 1 minute, 5 minutes, 15 minutes, 1 hour, then 6-hour
  intervals, capped at eight attempts.
- Mark a warning `obsolete` if its Queue Day closed, its deadline version
  changed, or its deadline passed before delivery.
- Keep terminal ticket-outcome intents retryable for at least seven days before
  marking `dead`; expose dead rows to operator logs/admin review.
- Record each provider attempt in the existing delivery history, linked to the
  outbox row.

### Realtime publication

After commit, publish a process-local SSE refresh signal as a latency
optimization. Another process's subscribers might not receive it, so clients
must fetch an initial snapshot, reconnect, and periodically refresh or refresh
on visibility/focus. A later shared pub/sub system may improve immediacy without
changing lifecycle correctness.

## Downtime spanning dates

On recovery:

1. Query every persisted `open` Queue Day whose stored deadline is past,
   regardless of its business date.
2. Close oldest first using its stored timezone/hours/deadline snapshot.
3. Apply outcomes based on ticket status at the authoritative deadline
   transition; processing time does not invent intermediate Queue Days.
4. Leave first-close waiting tickets as `pending_carry_over`.
5. Do not attach them to calendar dates that passed while the backend was down.
6. Expire pending tickets whose stored seven-day deadline passed.
7. Before opening a new Queue Day, reconcile every older open Queue Day for the
   same location, then activate only still-valid pending carry-over.

If downtime skipped the warning window, do not send a stale warning. Close and
send the actual outcome notifications.

## Bounds and operational evidence

Correctness does not require a dedicated worker for the MVP. Every web process
may run the bounded timer because row locks, conditional transitions, and
unique keys serialize results.

Each pass should log structured fields without customer contact data:

- trigger (`periodic`, `startup`, `request`);
- candidate, transitioned, no-op, retry, and failed counts;
- oldest overdue age and remaining backlog;
- Queue Day IDs/location IDs, not names or customer details;
- outbox pending/retry/dead counts and oldest pending age.

Alert-worthy correctness conditions:

- an open Queue Day remains overdue beyond two scan intervals;
- pending expiry backlog remains after repeated passes;
- a transition repeatedly deadlocks or exhausts retries;
- outbox rows become `dead`;
- a ticket references a closed Queue Day while still live outside the allowed
  `pending_carry_over` state.

Broader lifecycle analytics and a dedicated worker remain future operational
enhancements, not prerequisites for correctness.

## Implementation acceptance cases

1. Two backend instances attempt the same close; one transition/event/outbox
   set exists and both return the same closed result.
2. Close races call-next, join, booking check-in, restore, cancellation, and
   paid activation; the Queue Day lock yields one legal ordering with no live
   ticket attached after close.
3. Extension races close at the deadline; database time and the row lock select
   exactly one legal winner.
4. The process dies after ticket updates but before commit; all changes roll
   back.
5. The process dies after commit but before notification; outbox delivery
   resumes.
6. The process dies after provider acceptance but before marking sent; retry is
   at-least-once and uses the stable provider key/tag where possible.
7. Startup after several days closes old open Queue Days, skips stale warnings,
   and expires seven-day pending carry-over without inventing queue dates.
8. Opening races pending expiry at the exact deadline; one locked transition
   wins and the other becomes a no-op.
9. Repeated request-time snapshot calls do not duplicate close, warning, event,
   or notification records.
10. An active extension invalidates the previous warning version and produces
    exactly one new warning intent for the new deadline.
11. A paid payment settles after close; reconciliation rejects ticket issuance
    while preserving a recoverable payment-resolution path.
12. Reopening an early manual close changes only Queue Day availability and
    never revives ticket outcomes.
