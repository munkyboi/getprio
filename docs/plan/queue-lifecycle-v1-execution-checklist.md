# Queue Lifecycle V1 Execution Checklist

This document converts the queue lifecycle stability PRD into an implementation sequence for the current GetPrio codebase on branch:

```txt
prd-1-auth-session-rbac-v1-stability
```

The goal is to harden the existing queue behavior without forcing a full queue-domain rewrite.

---

## 1. Current Codebase Baseline

### Existing backend anchors

- [backend/src/services/queueService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/queueService.js)
- [backend/src/routes/vendorRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/vendorRoutes.js)
- [backend/src/routes/publicRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/publicRoutes.js)
- [backend/src/repositories/tickets.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/tickets.js)
- [backend/src/repositories/queueDayClosures.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/queueDayClosures.js)
- [backend/src/repositories/storeLocations.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/storeLocations.js)

### Existing frontend anchors

- [frontend/src/pages/VendorDashboardPage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/VendorDashboardPage.tsx)
- [frontend/src/pages/PublicQueuePage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/PublicQueuePage.tsx)
- [frontend/src/pages/JoinQueuePage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/JoinQueuePage.tsx)

### Existing strengths

- ticket creation, queue snapshots, call-next, serve, skip, and cancel already exist
- SSE-based live updates already exist

### Current risk

- lifecycle logic is still spread across service procedures and timestamp/status combinations rather than a single explicit transition map
- queue close/reopen did not exist in the live backend when this checklist was created, so Slice 3 became a new backend feature slice rather than a pure hardening pass
- carried-over precedence exists in code, but overflow and missed-ticket recovery semantics are not yet formalized end to end

---

## 2. Delivery Strategy

Do this in four slices.

### Slice 1

Formal transition map and queue invariants

### Slice 2

Queue event log table and event writing

### Slice 3

Closure / reopen / carry-over hardening

### Slice 4

Concurrency protections and lifecycle-focused tests

Current status:

- Slice 1: done
- Slice 2: done
- Slice 3: done
- Slice 4: done

Recommended next milestone: **package current recovery-band work and then extend service-order coverage**

---

## 3. Slice 1: Formal Transition Map

### 3.1 Create a lifecycle module

Add:

```txt
backend/src/services/queueLifecycle.js
```

Responsibilities:

- declare canonical statuses
- declare valid transitions
- expose helpers such as:
  - `isValidTransition(fromStatus, toStatus)`
  - `assertValidTransition(fromStatus, toStatus)`
  - `buildLifecycleTimestampPatch(toStatus, now)`
  - `isTerminalStatus(status)`

### 3.2 Canonical statuses

Use the current repo-aligned set:

```txt
waiting
called
served
skipped
cancelled
unserved
```

### 3.3 Update queue service usage

Refactor queue mutation paths in [queueService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/queueService.js) to call the lifecycle module instead of relying on route-local assumptions.

Target paths:

- ticket creation
- call next
- serve current
- skip current
- customer/vendor cancellation where allowed
- unserved/close-day transitions
- skipped/unserved requeue paths if present

### 3.4 Invariants to enforce immediately

- one authoritative status per ticket
- no invalid transitions such as `served -> waiting`
- no `waiting -> served` direct path unless the business rules explicitly create one
- no more than one active `called` ticket per tenant/location/queue-day

---

## 4. Slice 2: Queue Events

### 4.1 Add migration

Create:

```txt
database/migrations/<timestamp>_add_queue_events.sql
```

Add table:

```txt
queue_events
- id BIGSERIAL PRIMARY KEY
- ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE
- tenant_id BIGINT NOT NULL
- location_id BIGINT
- queue_date_key TEXT NOT NULL
- event_type TEXT NOT NULL
- from_status TEXT
- to_status TEXT
- actor_user_id BIGINT
- actor_role TEXT
- source TEXT NOT NULL
- metadata JSONB NOT NULL DEFAULT '{}'::JSONB
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes:

- `ticket_id, created_at`
- `tenant_id, location_id, queue_date_key, created_at`
- `event_type, created_at`

Mirror the schema in [database/init.sql](/Users/carloabella/Projects/getprio/dev/database/init.sql).

### 4.2 Add repository

Create:

```txt
backend/src/repositories/queueEvents.js
```

Responsibilities:

- append event
- list events for ticket
- optional list events for queue-day for later diagnostics

### 4.3 Write queue events transactionally

Every mutating queue action should append an event in the same transaction where feasible.

Minimum event coverage:

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

### 4.4 Event metadata

Keep metadata light in v1:

- actor context
- reason codes where present
- carry-over source queue-day
- closure counts if relevant

Do not block delivery on a perfect analytics schema.

---

## 5. Slice 3: Closure / Reopen / Carry-Over

### 5.1 Audit current close/reopen flow

Read and tighten:

- unresolved `waiting` ticket handling
- active `called` ticket handling
- explicit `unserved` marking
- carry-over ordering

### 5.2 Define close-day outcomes

Required behavior:

- active `called` -> `unserved`
- unresolved `waiting` -> explicit carry-over or explicit terminal handling
- snapshot reflects closed state immediately after commit

### 5.3 Reopen rules

Required behavior:

- reopen only affects the intended tenant/location/day scope
- reopen does not duplicate carry-over effects
- reopen remains auditable through `queue_events`

### 5.4 Preserve lineage

If carry-over creates new-day waiting eligibility, make sure original queue-day linkage remains queryable.

---

## 6. Slice 4: Concurrency and Tests

### 6.1 Concurrency protections

Hardening targets:

- duplicate `call-next`
- serve/skip/cancel races on the active ticket
- close vs staff action race
- reopen vs carry-over race

Use DB transaction boundaries and row-level selection/update patterns already used in the repo where possible.

### 6.2 Test coverage

Add focused backend tests for:

- valid and invalid transitions
- one-active-called-ticket invariant
- close-day outcome correctness
- reopen correctness
- carry-over ordering
- SSE publish only after committed mutation if practical to verify

### 6.3 UI verification pass

After backend hardening:

- vendor dashboard status labels
- public queue board status labels
- customer ticket lookup / join flow status labels

Need to agree on the same lifecycle vocabulary.

---

## 7. Recommended First Milestone

Start with:

1. `queueLifecycle.js`
2. queue-service transition refactor
3. `queue_events` migration
4. transactional event writes for call/serve/skip/cancel/close/reopen

This gives the queue model a clear center of gravity before touching deeper carry-over refactors.

---

## 8. Current Recommendation

Do **not** begin with UI changes.

First make the backend lifecycle explicit and evented, because:

- UI consistency depends on lifecycle truth
- reports and ETA will depend on lifecycle truth
- concurrency bugs are backend problems, not presentation problems

---

## 9. Post-Merge Follow-On Slices

The original queue-lifecycle branch is merged. The next lifecycle work should be treated as follow-on slices.

### Slice 5

Formalize priority bands and overflow semantics

### Slice 6

Missed-ticket recovery policy and backend support

### Slice 7

Vendor dashboard alignment for overflow and recovery behavior

Current status:

- Slice 5: done
- Slice 6: mostly done
- Slice 7: done

---

## 10. Slice 5: Priority Bands and Overflow Semantics

### 10.1 Queue ordering rule

Stable queue order should be:

```txt
carry_over > recovery > normal
```

This must be enforced in backend ordering, not only implied in the dashboard.

### 10.2 Overflow definition

Update snapshot shaping and dashboard expectations so:

- `Overflow queue` = carried-over tickets only
- skipped / unserved / cancelled belong in history or exception views

### 10.3 Data-model direction

Add explicit support for queue ordering concepts such as:

- `service_priority_band`
- `rejoin_deadline_at`
- optional future `priority_override_reason`

Do not rely forever on `carry_over_count` alone once recovery behavior exists.

---

## 11. Slice 6: Missed-Ticket Recovery

### 11.1 Recovery policy

For tickets that were `called` but not served:

- allow rejoin within a grace window
- return as `recovery`
- place behind `carry_over` and ahead of `normal`
- if the window expires, rejoin as `normal`

### 11.2 Backend work

Add:

- explicit recovery-band support in ticket ordering
- `rejoin_deadline_at` or equivalent grace-window tracking
- staff action to restore a missed ticket with recovery priority

Current status:

- explicit recovery-band support: done
- `rejoin_deadline_at`: done
- vendor restore action: done

### 11.3 Test coverage

Add focused tests for:

- recovery within grace window
- recovery after grace expiry
- carry-over tickets still outrank recovery tickets
- recovery tickets outrank fresh same-day joins

Current status:

- route-level restore coverage: done
- deeper order-selection coverage: pending

---

## 12. Slice 7: Vendor Dashboard Alignment

### 12.1 Queue tabs

Update the queue dashboard so:

- `Current queue` = active queue-day operational queue
- `Overflow queue` = carried-over waiting tickets only

### 12.2 Recovery UI

Recovery should not be hidden inside overflow.

Preferred future actions:

- `Restore with priority`
- `Restore normal`

Avoid generic `nudge up/down` until there is an explicit priority-override model and audit trail.

Current status:

- skipped-ticket recovery panel: done
- restore action from dashboard: done
- explicit manual override controls: pending
