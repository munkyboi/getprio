# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Queue lifecycle correctness
```

The goal is to make queue state transitions deterministic, auditable, and safe across customer joins, staff actions, carry-over, close/reopen flows, and public board updates.

---

## Implementation Status

Status date: `2026-06-06`

### Done

- centralized queue lifecycle transition rules
- canonical status enforcement for queue mutations
- `unserved` lifecycle support
- queue event log schema and transactional event writes
- queue-day close / reopen backend flow
- carry-over behavior for unresolved waiting tickets
- blocked operations while a queue day is closed
- vendor dashboard queue-day controls and current/overflow queue views
- customer joined-ticket flow aligned with queue lifecycle
- backend lifecycle coverage for:
  - close / reopen
  - blocked join / call-next while closed
  - duplicate call-next with an active ticket
  - empty-queue call-next behavior
  - duplicate close / reopen conflict paths

### Partial

- customer/public queue flow is lifecycle-aligned, but was advanced alongside product UI work rather than completed as an isolated PRD slice
- local database compatibility fixes exist for older closure/table shapes and should still be normalized carefully across environments

### Pending

- broader transaction-race verification beyond the current focused backend coverage
- final cleanup / packaging / merge workflow for the accumulated queue lifecycle branch work

---

## 1. Product Context

GetPrio is operational software. If queue state is wrong, every downstream surface becomes unreliable:

- customer ticket lookup
- public queue board
- vendor staff dashboard
- notifications
- history and reports
- payment-linked queue joins
- future ETA layer

Current queue behavior already exists and is usable, but it is still too dependent on route/service assumptions and status-specific code paths. Stable v1 needs a formally defined lifecycle model so new features do not keep adding state drift.

---

## 2. Problem Statement

Current queue operations already support:

- ticket creation
- call next
- serve
- skip
- cancel
- explicit unserved handling

Queue closure, queue reopen, and carry-over handling are part of this stabilization scope and were not fully implemented in the live backend when this PRD moved into execution.

The risk is not lack of features. The risk is that lifecycle correctness is not yet expressed as one clear state machine with explicit invariants.

Current classes of risk:

- state transitions may be valid in one path and invalid in another
- public/customer/staff interpretations of ticket state can drift
- close-of-day rollover can create hidden edge cases
- reopening and requeue behavior can create duplicate assumptions
- operational history is partly inferred from timestamps instead of a formal event model
- future reporting and ETA depend on lifecycle truth that is not fully normalized yet

---

## 3. Objectives

### Primary Objective

Define and implement a stable queue lifecycle model for v1 across all queue-facing operations.

### Secondary Objectives

- Make ticket state transitions explicit and enforceable
- Prevent impossible or contradictory ticket states
- Preserve a clean audit trail for later analytics and ETA
- Keep queue behavior consistent across API, dashboard, public board, and customer lookup

### Non-Objectives

- ETA prediction logic
- appointment scheduling
- priority rules beyond current FIFO + carry-over behavior
- advanced queue orchestration by service type/staff lane

---

## 4. Current-State Assessment

### Existing Strengths

- Core `tickets` table already exists
- Ticket timestamps exist for `called`, `served`, `skipped`, `cancelled`, `unserved`
- Public and vendor snapshots are already generated from live state
- Queue sequence generation is already transactional

### Current Gaps

- Lifecycle is represented by state + timestamps, but not documented as a formal state machine
- No single queue event history table exists for every state change
- Staff/customer/public state meanings are partly implicit
- Some edge cases are handled procedurally rather than through one lifecycle contract

---

## 5. Lifecycle Model

## 5.1 Canonical Ticket States

Stable v1 canonical ticket statuses:

```txt
waiting
called
served
skipped
cancelled
unserved
```

Definitions:

- `waiting`: ticket is active and eligible to be called
- `called`: ticket is currently being served or has been called forward and not yet resolved
- `served`: service completed successfully
- `skipped`: customer missed turn or was temporarily passed over
- `cancelled`: customer or staff cancelled ticket before service completion
- `unserved`: ticket was not completed before queue-day closure or explicit close-of-day handling

### State Design Rule

Status is authoritative. Timestamps support audit and UX, but status determines current behavior.

---

## 5.2 Valid Transitions

Allowed transitions:

```txt
waiting -> called
waiting -> cancelled
waiting -> skipped
waiting -> unserved

called -> served
called -> skipped
called -> cancelled
called -> unserved

skipped -> waiting
unserved -> waiting
```

Terminal states for the same queue-day instance:

```txt
served
cancelled
```

Conditional re-entry states:

```txt
skipped
unserved
```

### Invalid Transitions

Examples:

- `served -> waiting`
- `cancelled -> waiting`
- `served -> called`
- `cancelled -> served`
- `waiting -> served` without call or explicit exception path

Any invalid transition must fail server-side.

---

## 5.3 Timestamp Rules

Each lifecycle timestamp must correspond to its transition event:

- `created_at`: ticket created
- `called_at`: ticket transitioned to `called`
- `served_at`: ticket transitioned to `served`
- `skipped_at`: ticket transitioned to `skipped`
- `cancelled_at`: ticket transitioned to `cancelled`
- `unserved_at`: ticket transitioned to `unserved`
- `carried_over_at`: ticket was moved into a later queue-day

Rules:

- timestamps are append-only lifecycle facts
- status changes must set the corresponding timestamp if first reached
- timestamps for unrelated states must not be overwritten during later transitions

---

## 6. Queue-Day Model

## 6.1 Queue-Day Identity

Current operational grouping is:

```txt
tenant + location + queue_date_key
```

This remains the stable v1 queue-day identity.

### Queue-Day Rules

- only one active called ticket per tenant/location/queue-day
- waiting order is determined by carried-over precedence and creation order
- queue-day closure applies to one tenant/location/date scope at a time

---

## 6.2 Closure and Reopen Behavior

### Close Queue Day

On queue-day closure:

- unresolved `waiting` tickets become carry-over or otherwise terminal according to rule
- unresolved `called` tickets become `unserved`
- closure counts must be stored
- public and vendor snapshots must reflect closed state immediately

### Reopen Queue Day

Reopen is a recovery workflow, not a routine state flip.

Requirements:

- only allowed for the current queue-day and correct tenant/location scope
- must not duplicate carry-over effects
- must not create a second active queue-day interpretation
- must be fully auditable

### Carry-Over Rules

Stable v1 carry-over behavior:

- carry-over must be explicit in data
- carried-over tickets must preserve lineage to original queue-day
- carry-over count must increment deterministically
- carried-over tickets must re-enter waiting state in a predictable order

---

## 7. Ownership and Permissions

### Customer Actions

Customers or lookup-code holders may:

- read own ticket state
- cancel own ticket only while allowed by policy

Customers may not:

- alter queue order
- change queue status beyond allowed cancellation

### Vendor Staff Actions

Vendor staff may:

- call next
- mark served
- skip
- perform allowed requeue flows
- issue walk-in tickets where permitted

Vendor staff may not:

- perform tenant-wide destructive queue settings changes unless role allows

### Vendor Admin Actions

Vendor admin may:

- perform all staff operations
- close queue day
- reopen queue day
- manage queue rules and queue-adjacent settings

---

## 8. Event and Audit Model

Add a queue lifecycle event table.

Recommended table:

```txt
queue_events
- id
- ticket_id
- tenant_id
- location_id
- queue_date_key
- event_type
- from_status nullable
- to_status nullable
- actor_user_id nullable
- actor_role nullable
- source
- metadata jsonb
- created_at
```

Event types:

- `ticket_created`
- `ticket_called`
- `ticket_served`
- `ticket_skipped`
- `ticket_cancelled`
- `ticket_unserved`
- `ticket_requeued`
- `ticket_carried_over`
- `queue_closed`
- `queue_reopened`

### Rule

All queue-mutating operations must write one event record in the same transaction as the state change where feasible.

---

## 9. Snapshot and Real-Time Behavior

Current live snapshot model can remain, but its data contract must derive from lifecycle truth.

Requirements:

- snapshots read from authoritative ticket states
- SSE publishes only after successful queue mutation
- public board, vendor dashboard, and customer lookup must not derive conflicting state labels

### Public-State Rules

Public board may expose:

- current ticket number
- masked customer display where applicable
- waiting counts
- safe queue closure/open state

Public board must not expose:

- private notes
- full contact details
- internal operational flags

---

## 10. API Requirements

Stable v1 lifecycle actions must be explicit:

```txt
POST   /vendor/.../tickets/walk-in
POST   /vendor/.../tickets/call-next
POST   /vendor/.../tickets/current/serve
POST   /vendor/.../tickets/current/skip
POST   /vendor/.../tickets/current/cancel
POST   /vendor/.../queue/close
POST   /vendor/.../queue/reopen

POST   /public/.../tickets
DELETE /public/.../tickets/:lookupCode
GET    /public/.../ticket/:lookupCode
```

API rules:

- lifecycle endpoints must return updated ticket plus updated snapshot where relevant
- invalid state transitions return clear operational errors
- optimistic frontend assumptions are not allowed without server confirmation

---

## 11. Invariants

These must always hold:

- a ticket has exactly one authoritative current status
- only one active called ticket exists per tenant/location/queue-day
- a cancelled or served ticket cannot return to waiting
- queue closure cannot silently drop unresolved tickets
- carry-over must be explicit, never inferred only from UI
- customer-visible ticket position must only be computed for actively waiting tickets in the active queue-day

---

## 12. Edge Cases

Stable v1 must explicitly handle:

- customer cancels after being called
- staff skips current ticket repeatedly
- queue closes while there is an active called ticket
- reopen after carry-over already occurred
- duplicate call-next requests
- concurrent staff actions on the same queue
- queue-day rollover near timezone boundary
- location-specific queue-day calculation

### Concurrency Rule

Queue-mutating actions must be transaction-safe. Route-level protection alone is not sufficient.

---

## 13. Data Model Changes

### Required

- add `queue_events`

### Recommended Future-Proofing

Possible later additions:

- `resolution_reason`
- `cancelled_by_actor_type`
- `skipped_reason`
- `requeue_reason`

These are not required for stable v1, but the event schema should permit them in `metadata`.

---

## 14. Acceptance Criteria

- Ticket creation always produces a unique sequence and lookup code
- Calling next never results in two active called tickets
- Serving, skipping, and cancellation only work from valid states
- Closing queue day produces deterministic carry-over/unserved outcomes
- Reopen does not duplicate or corrupt carried-over tickets
- Public lookup and vendor dashboard agree on status semantics
- Queue events are written for all state-changing operations
- SSE updates reflect committed state only

---

## 15. Recommended Implementation Order

### Phase 1

- Formalize lifecycle transition map in code
- Centralize queue mutation rules

### Phase 2

- Add `queue_events`
- Write events for all ticket state transitions

### Phase 3

- Refactor queue closure/reopen/carry-over logic around explicit invariants

### Phase 4

- Add concurrency protections and lifecycle-focused tests

---

## 16. Final Recommendation

Treat queue lifecycle as a state machine, not just a set of helper functions.

That change will stabilize:

- customer trust
- vendor operations
- public board consistency
- reporting accuracy
- future ETA readiness
