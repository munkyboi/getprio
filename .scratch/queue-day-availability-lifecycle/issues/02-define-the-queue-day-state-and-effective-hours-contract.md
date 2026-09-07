# Define the Queue Day state and effective-hours contract

Type: grilling
Status: resolved
Claimed by:
Blocked by: 01

## Question

What canonical Queue Day state machine and effective-hours policy should govern manual opening, public availability, pause/resume, warning, after-hours extension, draining, manual close, auto-close, reopen, and the next local business date?

## Known direction

- Store hours make a Queue Day eligible; they never open it.
- An authorized vendor-side user manually opens during effective store hours.
- Auto-close warns at 15 minutes and supports audited 30-minute extensions.
- The lifecycle needs an explicit unopened state and deterministic closed state.

## Resolution must decide

1. Canonical state names, transitions, invariants, actors, and rejection rules.
2. Effective-hours behavior for weekly hours, overnight periods, closed days, timezone boundaries, and schedule changes while a queue is active.
3. The distinction between store closed, Queue Day unopened, intake paused, warning, closing/draining, extended, and closed.
4. Manual close/reopen rules, including whether and how reopening is allowed after hours.
5. How the next eligible Queue Day is selected without treating weekends or closed days as active queue days.

## Working notes

- Agreed: the canonical Queue Day lifecycle has only three states:
  `unopened`, `open`, and `closed`.
- Agreed: intake is an orthogonal `accepting` or `paused` mode available only
  while the Queue Day is open.
- Agreed: auto-close timing is an orthogonal phase—`normal`, `warning`,
  `extended`, or `overdue`—rather than multiplying lifecycle states.
- Agreed: there is no persistent `draining` lifecycle state. Closing is the
  transition that settles affected ticket outcomes and makes the Queue Day
  closed.
- Agreed: an overnight Queue Day is anchored to the location-local date on
  which its effective store-hours interval begins. Crossing midnight does not
  create or switch to another Queue Day.
- Agreed: missing weekly hours or an explicitly closed weekday makes that local
  business date ineligible for a Queue Day. Different open/close times define
  a same-day or overnight interval; equal times on an active row preserve the
  current explicit 24-hour interpretation.
- Agreed: this slice uses weekly hours as Effective Store Hours. Holiday and
  temporary exceptions are not added now, but Queue Day semantics must accept
  a future effective-hours resolver without changing their contract.
- Agreed: an authorized Vendor-Side User may grant repeatable 30-minute
  extensions, but each extension requires a fresh explicit action during the
  current 15-minute warning and records its actor and deadline change. If
  nobody acts, the Queue Day closes at its current deadline; there is no
  disable-auto-close action.
- Agreed: opening a Queue Day snapshots that day's Effective Store Hours and
  establishes its initial close deadline. Later recurring-hours edits apply
  only to Queue Days that have not opened; an active day closes earlier through
  manual close or operates later through an audited extension.
- Agreed: an early manually closed Queue Day may be reopened only while local
  time remains inside its snapshotted interval and before its current close
  deadline. Auto-closed and stale-reconciled Queue Days cannot be reopened
  through ordinary vendor controls. Reopening does not implicitly reverse
  ticket outcomes; that policy belongs to the ticket-outcomes contract.
- Agreed: pausing blocks every action that adds or returns a ticket to waiting:
  customer join, paid-ticket issuance, vendor walk-in, booking check-in, and
  skipped-ticket restoration. Staff may still call, serve, skip, cancel,
  manually close, or extend while paused. The warning and deadline continue,
  and resume is allowed before the current deadline, including during an
  extension.
- Agreed: entering the 15-minute warning does not change Queue Intake Mode.
  An accepting queue continues to accept joins, while staff may pause intake
  explicitly. Vendor UI exposes the danger countdown and extension action;
  customer UI communicates that the queue is closing soon. The Queue Day still
  closes at the deadline if it is not extended.
- Agreed: staff may open at any instant strictly inside Effective Store Hours.
  If less than 15 minutes remain, the Queue Day opens directly in warning with
  the remaining countdown and extension action. Opening at or after the
  scheduled close is rejected; there is no hidden minimum operating duration.
- Agreed: carry-over is not assigned to a predicted calendar date. It remains
  pending until the first later eligible Queue Day that staff actually open,
  then attaches atomically before new joins are accepted. Closed dates and
  eligible-but-unopened dates do not consume the one carry-over opportunity.
- Agreed: the current close deadline is authoritative. At or after it, queue
  mutations cannot proceed against the overdue open day and may first trigger
  the same idempotent reconciliation used by periodic and startup scans.
  `overdue` is a short-lived reconciliation condition, not extra operating
  time caused by a delayed worker.
- Agreed: if Effective Store Hours end without manual opening, the Queue Day
  becomes `closed` with reason `not_opened`. It cannot later open or reopen,
  has no attached tickets, and does not consume pending carry-over. Whether an
  empty missed day needs a row or may be derived is deferred to schema design.
- Agreed: manual close is immediate after explicit confirmation and may occur
  whenever the Queue Day is open, including while paused, warning, or extended.
  The confirmation previews affected waiting/called counts; the close
  transition applies the later ticket-outcomes contract atomically. The
  15-minute warning belongs only to scheduled auto-close.
- Agreed: opening snapshots the location timezone together with Effective
  Store Hours. Later timezone edits affect only unopened and future Queue Days;
  an active day's business-date identity and deadlines remain interpreted in
  its opening-time timezone until close.
- Agreed: a 30-minute extension also extends the active Queue Day's queue
  operating window. If intake is accepting, customers may join during that
  after-hours extension. It does not change recurring store hours, general
  store status, or booking availability; public queue status identifies the
  extended deadline.

## Resolution

The canonical Queue Day lifecycle is deliberately small:

```text
unopened -> open -> closed
               ^       |
               |_______|
          restricted reopen
```

`closed -> open` is permitted only for an early manual close, while local time
is still within the opening-time interval and before the current deadline.
Auto-closed, stale-reconciled, and `not_opened` days cannot be reopened through
ordinary vendor controls.

Queue Intake Mode (`accepting` or `paused`) and Queue Auto-Close Phase
(`normal`, `warning`, `extended`, or briefly `overdue`) are orthogonal to the
lifecycle. There is no persistent draining state. Pause blocks every action
that adds or returns a ticket to waiting, but staff may continue processing
existing tickets and the close clock continues.

An authorized Vendor-Side User may open at any instant strictly inside the
location's Effective Store Hours. Opening snapshots:

- the location-local business date;
- the location timezone;
- the effective opening and closing instants; and
- the initial close deadline.

Overnight and 24-hour intervals belong to the local date on which the interval
begins. Missing hours or an explicitly closed weekday is ineligible. Equal
opening and closing times on an active row retain the current 24-hour meaning.
Recurring-hours and timezone edits do not alter an already-open Queue Day.
Holiday and temporary exceptions remain out of this slice, but may later feed
the same Effective Store Hours contract.

The warning begins 15 minutes before the current deadline and does not
automatically pause intake. Opening with less than 15 minutes remaining begins
directly in warning. During each warning, an authorized Vendor-Side User may
explicitly grant another audited 30-minute extension. Each extension moves the
deadline, later produces a fresh warning, and extends customer queue
availability without changing recurring store hours or booking availability.
There is no permanent auto-close cancellation.

Manual close is immediate after an explicit confirmation that previews affected
waiting/called counts. At or after the current deadline, the day is overdue:
mutations cannot proceed, and request-time, periodic, or startup reconciliation
attempts the same idempotent close transition. Worker delay never grants extra
operating time.

If an eligible interval ends without manual opening, the Queue Day resolves as
`closed / not_opened`; it cannot reopen and consumes no carry-over opportunity.
Carry-over is not assigned to a predicted date. It remains pending between days
and attaches atomically to the first later eligible Queue Day staff actually
open, before new joins are accepted.

Exact role permissions, notification delivery, ticket outcome/reopen effects,
database representation, and transition serialization remain assigned to their
dedicated downstream tickets.
