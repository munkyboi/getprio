# Define ticket outcomes at close and reconciliation

Type: grilling
Status: resolved
Claimed by:
Blocked by: 02

## Question

What deterministic outcome must each ticket status receive when a Queue Day
warns, closes, is extended, is reopened, or is reconciled after the intended
close time, including a bounded policy for a ticket already called before
close?

## Known direction

- A waiting ticket may carry into one next eligible open Queue Day.
- A carried-over waiting ticket expires when that one Queue Day closes unresolved.
- Expiration is distinct from cancellation and must be visible, notified, and audited.
- A currently called customer should not be abandoned merely because the clock reaches closing time.
- The Queue Day contract has no persistent `draining` state; closing must still
  produce deterministic outcomes.

## Resolution must decide

1. Outcomes for `waiting`, carried-over `waiting`, `called`, `skipped`, `served`, `cancelled`, `unserved`, checked-in booking tickets, and any newly introduced `expired` status.
2. Whether a called ticket receives a bounded pre-close completion grace or
   another deterministic outcome without introducing a persistent draining
   Queue Day state.
3. How skipped-ticket recovery interacts with closing and why it cannot remain restorable indefinitely.
4. Reopen behavior after carry-over or expiration without duplicating tickets or reversing terminal outcomes incorrectly.
5. Customer-visible explanations, notification triggers, event reasons, and history grouping for every outcome.

## Working notes

- Carried forward from the map: a first-day unresolved waiting ticket becomes
  pending carry-over and attaches to the first later Queue Day staff actually
  open.
- Carried forward from the map: a once-carried waiting ticket becomes
  terminally `expired` when that opened Queue Day closes unresolved; it is not
  cancelled or carried again.
- Carried forward from the Queue Day contract: there is no persistent draining
  Queue Day state, and the current close deadline remains authoritative.
- Agreed: a `called` ticket that is still incomplete at the current close
  deadline becomes terminally `unserved`. The 15-minute warning and explicit
  30-minute extension are the only completion grace; reconciliation applies
  the same outcome and customer explanation if processing happens late.
- Agreed: a `skipped` ticket may be restored only while its original Queue Day
  is open and intake is accepting. Closing permanently ends recovery; the
  ticket remains terminally `skipped`, never carries over, and is not revived
  by an in-hours Queue Day reopen.
- Agreed: reopening changes Queue Day availability only. It never reverses
  `served`, `cancelled`, terminal `skipped`, `unserved`, or `expired`; nor does
  it recall pending carry-over. An authorized Vendor-Side User may accommodate
  a customer with a new replacement ticket explicitly linked to the immutable
  original outcome.
- Agreed: a waiting ticket created from a checked-in booking receives the same
  one pending carry-over opportunity as a walk-in ticket and takes
  `carry_over` priority when attached to the next actually opened Queue Day.
  Its booking remains linked; service completes the booking, while unresolved
  close on the carried day expires the ticket.
- Agreed: when a checked-in booking's linked ticket becomes `unserved` or
  `expired`, the booking becomes terminally `unfulfilled` rather than remaining
  confirmed or being mislabeled as cancelled/no-show. This outcome requires
  vendor follow-up and full-refund eligibility under the existing
  vendor-handled payment model.
- Agreed: when a checked-in booking's linked ticket remains `skipped` at close,
  the booking becomes terminally `missed`. The customer did check in, so this
  is neither no-show nor vendor-failure `unfulfilled`; it follows the existing
  non-refundable missed-turn policy.
- Agreed: first unresolved close changes `waiting` to an explicit
  `pending_carry_over` status rather than future-dating a live waiting ticket.
  It remains visible in history and cancellable, but has no live position or
  near-turn eligibility. Opening the first later eligible Queue Day atomically
  changes it back to `waiting` with carry-over priority.
- Agreed: `pending_carry_over` has a maximum age of seven calendar days from
  the original close. If no later Queue Day opens by then, it becomes
  `expired` with reason `carry_over_window_elapsed`; a linked checked-in
  booking becomes `unfulfilled` and full-refund eligible. Closed/unopened days
  do not consume the opportunity before that safety deadline.
- Agreed: carry-over preserves the ticket record, lookup code, customer
  history, and original identity, but activation allocates a fresh daily
  sequence and display number. The carry-over event records both numbers and
  the customer is notified of the new number.
- Agreed: a customer may cancel while `pending_carry_over`. The ticket becomes
  `cancelled` with reason `carry_over_declined`; if linked to a checked-in
  booking, that booking remains `unfulfilled` and full-refund eligible because
  the original service was not delivered. Declining the offered continuation
  does not invoke customer-cancellation forfeiture.
- Agreed: durable customer notification intent is created for first close into
  pending carry-over, activation with a fresh display number, expiration,
  unserved close, terminal skipped recovery, and carry-over decline. Close does
  not duplicate notifications for tickets already terminal. Channel selection,
  retry, and delivery deduplication remain assigned to the notification ticket.
- Agreed: customer and vendor history present one journey under the stable
  ticket identity, with timeline segments for original join/number, first close
  into pending carry-over, activation date/new number, and final outcome.
  Vendor views may group by Queue Day segment without representing carry-over
  as a duplicate ticket.
- Agreed: close applies carry-over uniformly. Every first-time ordinary or
  booking-linked `waiting` ticket becomes `pending_carry_over`; a carried
  waiting ticket expires. Staff cannot choose arbitrary per-ticket outcomes
  inside close. Any vendor cancellation is a separate pre-close action with
  its own reason and booking/refund consequences.
- Agreed: ticket outcome reason is separate from transition source. Reasons
  include `queue_day_closed`, `carried_queue_day_closed`,
  `carry_over_window_elapsed`, `called_at_queue_close`,
  `skipped_recovery_ended`, and `carry_over_declined`. Sources distinguish
  vendor manual close from deadline, periodic, startup, and request-time system
  reconciliation. An optional staff closure note is separate from both.
- Carried forward from the Queue Day contract: warning and extension do not
  themselves change any ticket status; they only expose or move the current
  close deadline.

## Resolution

Closing and reconciliation use one deterministic outcome table regardless of
whether execution is manual, on-time automatic, periodic, startup, or
request-triggered:

| Ticket at close | Outcome |
| --- | --- |
| First-day `waiting` | `pending_carry_over` |
| Carried `waiting` | Terminal `expired` with `carried_queue_day_closed` |
| `called` | Terminal `unserved` with `called_at_queue_close` |
| Restorable `skipped` | Remains `skipped`, but recovery becomes terminally closed |
| `served`, `cancelled`, `unserved`, or `expired` | No status change and no duplicate notification |

Warning and extension do not change ticket status. There is no automatic
called-ticket grace or draining lifecycle: staff must explicitly extend before
the authoritative deadline to keep a called ticket live.

`pending_carry_over` is a real between-days status, not a future-dated waiting
row. It has no live position or near-turn eligibility, remains visible and
cancellable, and waits for the first later eligible Queue Day staff actually
open. Activation atomically returns it to `waiting` with carry-over priority,
preserves the stable ticket/lookup identity, and allocates a fresh daily
sequence/display number. If no Queue Day opens within seven calendar days of
the original close, it expires with `carry_over_window_elapsed`.

Reopen changes Queue Day availability only. It never recalls pending
carry-over or reverses `served`, `cancelled`, terminal `skipped`, `unserved`, or
`expired`. Customer accommodation creates a new Replacement Queue Ticket
linked to the immutable original.

Booking-linked tickets receive the same one carry-over opportunity:

| Linked ticket outcome | Booking outcome |
| --- | --- |
| `served` | `completed` |
| `unserved` or `expired` | `unfulfilled`, vendor follow-up and full-refund eligible |
| Terminal `skipped` | `missed`, non-refundable missed-turn policy |
| Customer declines pending carry-over | Ticket `cancelled / carry_over_declined`; booking remains `unfulfilled` and refund-eligible |

History presents one cross-day journey under the stable ticket identity, with
Queue Day segments and old/new display numbers. Customer notification intent
is created once for pending carry-over, activation, expiration, unserved close,
terminal skipped recovery, and carry-over decline.

Outcome reason is separate from transition source and optional staff closure
notes. The source distinguishes manual close, deadline processing, and
periodic/startup/request-time reconciliation without changing customer meaning.
