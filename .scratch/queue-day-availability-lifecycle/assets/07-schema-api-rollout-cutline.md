# Queue Day schema, API, migration, and rollout cutline

Date: 2026-07-31
Status: implementation-ready rollout decision

## Decision summary

Introduce an additive `queue_days` aggregate and make it the eventual authority
for Queue Day lifecycle, intake mode, effective-hours snapshots, deadlines,
versions, and daily sequence allocation. Do not replace or drop
`queue_day_closures`, `queue_day_pauses`, existing ticket identity columns, or
`queue_events` during this effort.

Roll out in four stages:

1. expand the schema while the old backend is still running;
2. deploy a compatibility backend/frontend with lifecycle enforcement disabled;
3. backfill and shadow-compare the new model;
4. enable the new authority per location only after verification gates pass.

Once the new ticket statuses or Queue Day transitions are written, rollback
means disabling enforcement or deploying a forward fix. It does not mean
returning to a pre-expansion backend that cannot understand the new rows.

## Current compatibility seams

The current code cannot be changed safely with a one-shot replacement:

- Queue Day openness is inferred from the absence of an active
  `queue_day_closures` row. There is no authoritative open/unopened row.
- Most queue operations use the process default date key; not every path uses
  the resolved location timezone.
- Closing immediately rewrites waiting tickets onto a predicted next calendar
  date. There is no `pending_carry_over` state.
- Reopen currently reverses unserved/carry-over mutations, conflicting with the
  confirmed terminal-outcome contract.
- Paid queue-ticket activation calls
  `createTicketForTenantInTransaction(...)` without first applying the same
  Queue Day intake guard as a direct join.
- Booking check-in applies an intake guard, but it still creates a ticket
  without locking an authoritative Queue Day aggregate.
- Staff, Admin, and Owner share `tenant.queue.operate`; reopening and
  location-assignment scope are not separate permissions.
- `queue_events` is useful history but lacks a unique event key, Queue Day
  foreign key, correlation key, deadline version, and explicit before/after
  aggregate state.
- `notification_deliveries` records provider results after email/SMS work; it
  is not a transactional intent outbox and does not represent Web Push intent.
- `QueueSnapshot.queueDay` exposes only closure/pause aliases. Public, vendor,
  SSE, and shared types do not carry authoritative deadlines or versions.
- `TicketStatus` lacks `pending_carry_over` and `expired`; `BookingStatus` lacks
  `unfulfilled` and `missed`.
- The fresh-install `tickets` definition currently contains both an older
  inline status check and a later expanded table check. The implementation
  migration must reconcile status constraints by definition, not assume one
  hard-coded constraint name.

The local database was not running during this planning ticket, so no live row
counts are claimed. Production preflight must collect the inventory below
before backfill or enforcement.

## Target persistence model

### `queue_days` — authoritative aggregate

Create one row at most per tenant, location, and location-local business date:

| Column | Contract |
| --- | --- |
| `id` | Stable Queue Day identity and lock target. |
| `tenant_id`, `location_id`, `business_date` | Unique location-local scope. Use `DATE`, while legacy date keys remain compatibility fields elsewhere. |
| `state` | `unopened`, `open`, or `closed`. |
| `intake_mode` | `accepting` or `paused` while open; `NULL` otherwise. |
| `timezone_snapshot` | IANA timezone captured at open. |
| `effective_opens_at`, `effective_closes_at` | Absolute instants resolved from the opening-time Effective Store Hours. |
| `initial_closes_at`, `current_closes_at` | Original and authoritative current close deadlines. |
| `opened_at`, `opened_by_user_id` | Manual-open evidence. |
| `closed_at`, `closed_by_user_id` | Close evidence when state is closed. |
| `close_reason`, `close_source`, `closure_note` | Structured customer meaning, execution source, and optional staff note kept separate. |
| `last_reopened_at`, `last_reopened_by_user_id`, `reopen_reason` | Restricted early-manual-close reopen evidence. |
| `version` | Incremented for every aggregate mutation and used by interactive optimistic concurrency. |
| `deadline_version` | Incremented only when the authoritative deadline changes. |
| `next_sequence` | Daily display-number allocation under the Queue Day lock. |
| `last_reconciled_at`, `reconciliation_attempt_count`, `last_reconciliation_error` | Sanitized operational recovery evidence; error is not a lifecycle state. |
| `created_at`, `updated_at` | Record timestamps. |

Required constraints and indexes:

- unique `(tenant_id, location_id, business_date)`;
- state/intake consistency checks;
- positive versions and `current_closes_at >= initial_closes_at`;
- due-work index on `(current_closes_at, id) WHERE state = 'open'`;
- location history index on
  `(tenant_id, location_id, business_date DESC)`.

An absent row is allowed for a date that nobody opened. Availability resolves
that date as derived `unopened` while inside its eligible interval and derived
`closed / not_opened` afterward. Opening inserts the row with
`ON CONFLICT DO NOTHING`, locks it, and transitions it in the same transaction.
This avoids pre-creating a row for every closed or unused business date while
retaining the canonical three-state API contract. A later analytics effort may
materialize `not_opened` rows without changing semantics.

### `queue_day_extensions`

Create an immutable child record for each confirmed 30-minute extension:

- `queue_day_id`;
- `previous_closes_at`, `new_closes_at`;
- `minutes` constrained to `30`;
- resulting `deadline_version`;
- actor user ID/role;
- structured reason code and optional note;
- `created_at`;
- unique `(queue_day_id, deadline_version)`.

The Queue Day row remains current-state authority. Extension rows explain its
deadline history.

### Existing closure and pause tables

Retain both tables and add nullable `queue_day_id` foreign keys:

- backfill links where tenant/location/business date matches;
- continue old writes only in `legacy` and `shadow` modes;
- in `enforced` mode, `queue_days.intake_mode` and `queue_days.state` are
  authoritative and Queue Day Lifecycle Events replace new closure/pause
  history writes;
- never delete historical closure/pause rows in this effort.

This preserves current reports and gives rollback/shadow tools evidence to
compare without maintaining two permanent authorities.

### Ticket root and Queue Day segments

Keep `tickets.id` and `lookup_code` as stable cross-day identity. Add:

| Column | Purpose |
| --- | --- |
| `original_queue_day_id` | Queue Day where the journey began. |
| `current_queue_day_id` | Attached live Queue Day, `NULL` while pending carry-over or terminal. |
| `status_reason` | Structured outcome reason separate from source/note. |
| `pending_carry_over_since` | First close that offered carry-over. |
| `carry_over_expires_at` | Seven-calendar-day safety deadline. |
| `carry_over_consumed` | One-time opportunity invariant. |
| `terminal_at` | Common terminal-outcome timestamp. |
| `replacement_for_ticket_id` | Links a new accommodation ticket without changing the original outcome. |

Expand the status constraint to:

`waiting`, `pending_carry_over`, `called`, `served`, `skipped`, `cancelled`,
`unserved`, and `expired`.

Create `queue_ticket_segments`:

| Column | Purpose |
| --- | --- |
| `id`, `ticket_id`, `queue_day_id` | One journey segment per attached Queue Day. |
| `display_number`, `sequence` | Queue Day-specific number. |
| `priority_band` | `carry_over`, `recovery`, `checked_in_booking`, or `normal`. |
| `activated_at`, `ended_at` | Segment lifetime. |
| `segment_outcome`, `outcome_reason` | Explanation at detach/close. |
| `legacy_inferred` | Identifies reconstructed history. |

Use unique `(ticket_id, queue_day_id)` and `(queue_day_id, sequence)`.

Retain and synchronize legacy `tickets.ticket_number`, `sequence`, `date_key`,
`queue_date_key`, `carried_over_at`, `carry_over_count`, and
`service_priority_band` during the compatibility window:

- while live, they mirror the current segment;
- while pending or terminal, they preserve the most recent display value;
- old readers never treat `pending_carry_over` as live because status filtering
  excludes it;
- no column is dropped until a separate post-rollout cleanup decision.

### Booking outcome additions

Expand `BookingStatus` and its database constraint with `unfulfilled` and
`missed`. Add:

- `fulfillment_outcome_reason`;
- `refund_eligible BOOLEAN NOT NULL DEFAULT FALSE`;
- `fulfillment_resolved_at`.

Existing payment/refund columns remain payment authority. These fields express
the service outcome and vendor follow-up obligation without pretending that an
automatic payment refund already occurred.

### Queue Day Lifecycle Events

Expand `queue_events` rather than introducing a competing event table:

- `queue_day_id`;
- `event_key`;
- `correlation_key`;
- `reason_code`;
- `deadline_version`;
- `previous_state JSONB`;
- `next_state JSONB`;
- `staff_note`.

Backfill existing rows with deterministic `legacy:queue-event:<id>` keys, then
enforce a unique index on `event_key`. Keep current ticket-specific
`from_status` and `to_status` columns for compatibility.

The event key is the idempotency boundary, for example:

```text
queue-day:<id>:version:<version>:opened
queue-day:<id>:version:<version>:reopened
queue-day:<id>:deadline:<version>:warning:15m
queue-day:<id>:deadline:<version>:warning:5m
queue-day:<id>:deadline:<version>:extended
queue-day:<id>:version:<version>:closed
ticket:<id>:queue-day:<id>:pending-carry-over
ticket:<id>:pending-expiry:<timestamp>
```

### Transactional notification outbox

Create `queue_notification_outbox` with:

- unique `idempotency_key`;
- `queue_event_id`, `queue_day_id`, `ticket_id`, and tenant scope;
- `recipient_key`, `channel`, template name, and versioned JSON payload;
- aggregate/deadline versions;
- `pending`, `processing`, `retry`, `sent`, `dead`, or `obsolete` status;
- availability/expiry, attempt, lease, error, sent, and timestamp fields.

Allow Web Push and email lifecycle intents. Existing SMS infrastructure is not
expanded by this effort. Extend `notification_deliveries` to link an
`outbox_id`, accept `web_push` where provider attempts are persisted, and remain
delivery history rather than intent authority.

### Staff location scope and permissions

Create `tenant_membership_locations`:

- `tenant_membership_id`;
- `location_id`;
- `assignment_source` (`explicit` or `legacy_backfill`);
- assigning user and timestamp;
- unique membership/location pair;
- a constraint or trigger that membership and location belong to the same
  tenant.

Owners and Admins retain implicit access to all tenant locations. Staff queue
operations require an active assignment.

To preserve current access, backfill every active legacy Staff membership to
all currently active locations in that tenant with
`assignment_source = 'legacy_backfill'`. This does not silently revoke working
access during deployment. Vendor Admin can narrow assignments after rollout;
new Staff membership creation requires explicit location selection.

Split permissions:

- keep `tenant.queue.operate` for assigned-location routine actions;
- add `tenant.queue.reopen` for Owner/Admin;
- add Platform Admin read, retry-reconciliation, requeue-notification, and
  repair permissions;
- do not give Platform Admin `tenant.queue.operate`.

### Queue payment issuance binding

Add nullable compatibility fields to `queue_join_payments`:

- `queue_day_id`;
- `queue_day_version_at_checkout`;
- `ticket_issuance_status` (`pending`, `issued`, `blocked`, `refund_pending`);
- `ticket_issuance_reason`;
- `ticket_issuance_attempted_at`.

OTP/payment creation binds the intended Queue Day server-side. Paid activation
locks payment first, then that Queue Day. If it is no longer open and accepting,
payment remains recorded as paid, no ticket is issued into another day, and the
payment enters explicit blocked/refund follow-up. Never silently attach a late
provider callback to a newly opened Queue Day.

## Migration and backfill sequence

Use lexically ordered additive migrations. Exact names may follow repository
convention; the implementation should preserve this dependency order:

1. `20260731_01_add_queue_day_lifecycle_foundation.sql`
   - create `queue_days` and `queue_day_extensions`;
   - add nullable legacy links;
   - add `store_locations.queue_lifecycle_mode` with
     `legacy | shadow | enforced`, default `legacy`.
2. `20260731_02_expand_queue_ticket_booking_lifecycle.sql`
   - add nullable ticket/booking columns;
   - create `queue_ticket_segments`;
   - replace status checks by inspecting/dropping every constraint whose
     definition restricts the relevant status column, then install the one
     canonical check.
3. `20260731_03_expand_queue_events_and_add_outbox.sql`
   - add event fields;
   - create the outbox;
   - expand delivery-channel compatibility.
4. `20260731_04_add_queue_location_assignments_and_permissions.sql`
   - create assignment rows and supporting indexes;
   - backfill legacy Staff access without revocation.
5. A later validation migration, deployed only after backfill verification,
   validates foreign keys/checks and makes fields non-null where the backfill
   proves that safe.

Every expansion file must be safe while the pre-change backend remains live:
no renamed/dropped columns, no immediately mandatory application-written
field, and no status rewrite in the schema-expansion transaction.

### Resumable backfill job

Do not put the potentially long, judgment-bearing row conversion into the
deployment migration transaction. Implement a resumable,
`FOR UPDATE SKIP LOCKED` backfill command with a run/checkpoint table and a
`queue_lifecycle_migration_anomalies` table.

Process one tenant/location/business-date group per short transaction:

1. Derive `business_date` from `queue_date_key` using the location timezone.
   Invalid or missing date keys go to anomalies and remain unenforced.
2. Link active/historical closures and pauses to one Queue Day.
3. Create a closed Queue Day for an active closure.
4. For ticket-only historical dates:
   - terminal-only dates become `closed / legacy_import`;
   - any date with nonterminal tickets becomes an overdue open Queue Day so the
     real reconciler, not the migration, applies outcomes and notifications.
5. For the current local date with no active closure:
   - create an open Queue Day only if there is evidence of active legacy
     operation—current-day queue activity, nonterminal tickets, or active
     pause—and local time is still within Effective Store Hours;
   - otherwise leave it derived unopened. This is the intentional manual-open
     cutover.
6. Snapshot timezone/effective instants using the best current schedule
   evidence, and mark inferred values in the migration metadata/event.
7. Create ticket segments and attach live tickets.
8. Populate event keys and legacy links.

The backfill itself creates no customer lifecycle notifications and does not
silently finalize tickets. After outbox-capable code is deployed, the normal
reconciler processes overdue/due rows and atomically creates the real outcomes,
events, booking updates, and notification intents.

### Existing carried and stale tickets

Classify without inventing certainty:

| Legacy evidence | Backfill treatment |
| --- | --- |
| `carry_over_count = 0`, unresolved past-day waiting | Attach to an overdue imported Queue Day; reconciliation moves it to `pending_carry_over` and sets the seven-day deadline from the inferred/original close. |
| `carried_over_at IS NOT NULL` or `carry_over_count >= 1`, but no evidence the target day actually operated | Convert to `pending_carry_over`, set `carry_over_consumed = TRUE`, clear live attachment, and retain the legacy target date only in event metadata. |
| Carried waiting on the current day with affirmative current-day activity inside hours | Attach as live carried waiting and create a legacy-inferred segment. |
| Carried waiting attached to an overdue operated day | Attach to the overdue Queue Day; normal close reconciliation expires it. |
| Past-day `called` | Attach to an overdue Queue Day; reconciliation produces `unserved`. |
| Past-day `skipped` | Attach to an overdue Queue Day; reconciliation ends recovery without changing its terminal `skipped` status. |
| `carry_over_count > 1`, invalid date key, missing location, conflicting closure rows, or duplicate daily sequence | Preserve the row, record an anomaly, block location enforcement, and require reviewed repair. |

Do not reduce a historical carry-over count, delete a ticket, or mark an
ambiguous row cancelled. For pending rows already older than seven days, set a
due expiry deadline; let the deployed expiry command create `expired`,
booking/outbox effects, and audit evidence.

### Production preflight inventory

Capture counts and sample IDs for:

- nonterminal tickets grouped by tenant/location/queue date and local age;
- carried rows grouped by `carry_over_count`, including counts greater than one;
- active and repeated closure/pause rows per scope/date;
- queue date keys that do not parse as `YYYYMMDD`;
- tickets whose `date_key` and `queue_date_key` disagree;
- duplicate `(tenant, location, date/queue_date, sequence)` candidates;
- booking-linked tickets in nonterminal or legacy unserved states;
- paid queue payments without a ticket;
- Staff memberships with no active location/counter assignment;
- existing migration/schema drift, including actual status-check definitions.

Save the aggregate report and a backup identifier before expansion. Do not put
customer names, email addresses, phone numbers, or lookup codes in routine
deployment logs.

## API compatibility contract

### Snapshot expansion

Keep all existing routes and response fields. Expand `queueDay` additively:

```ts
interface QueueDayStatus {
  id: string | null;
  businessDate: string;
  state: "unopened" | "open" | "closed";
  availabilityReason:
    | "outside_store_hours"
    | "not_opened"
    | "accepting"
    | "paused"
    | "closing_soon"
    | "reconciling"
    | "extended"
    | "closed";
  intakeMode: "accepting" | "paused" | null;
  autoClosePhase: "normal" | "warning" | "extended" | "overdue" | null;
  timezone: string;
  effectiveOpensAt: string | null;
  effectiveClosesAt: string | null;
  currentClosesAt: string | null;
  warningStartsAt: string | null;
  finalWarningStartsAt: string | null;
  serverNow: string;
  version: number | null;
  deadlineVersion: number | null;
  closeReason: string | null;

  // Deprecated aliases retained through the compatibility window.
  isClosed: boolean;
  isPaused: boolean;
  queueDateKey: string;
  closedAt: string | Date | null;
  reopenedAt: string | Date | null;
  closureReason: string | null;
  pausedAt: string | Date | null;
  resumedAt: string | Date | null;
  pauseReason: string | null;
  pauseMode: "manual" | "auto_threshold" | null;
}
```

Public/customer snapshots receive only safe availability fields. Vendor
snapshots may add an `operations` object with permission booleans, affected
ticket counts, and retryable state. Sanitized reconciliation error details stay
in Platform Admin APIs, never the public snapshot.

Expand ticket responses additively with `statusReason`,
`carryOverExpiresAt`, `currentQueueDayId`, and journey segments where the
authenticated/customer lookup route is authorized. Public boards do not expose
private journey detail.

All SSE events continue sending the full additive snapshot. Existing clients
continue using `isClosed`, `isPaused`, and existing arrays until migrated.

### Mutation routes

Add:

- `POST /vendor/tenant/:tenantSlug/queue/open`;
- `POST /vendor/tenant/:tenantSlug/queue/extend`.

Keep existing pause, resume, close, reopen, call-next, ticket-state, walk-in,
booking-check-in, public join, OTP, payment-sync, and SSE paths.

Lifecycle mutation bodies accept additive:

```json
{
  "expectedVersion": 12,
  "reason": "required where policy requires it",
  "note": "optional"
}
```

Every route resolves the location, locks/reconciles the Queue Day, checks
location-scoped permission, and only then performs the mutation. Apply this to
direct join, vendor walk-in, skipped restoration, booking check-in, OTP verify,
paid-ticket activation/sync, and all queue operations.

Use stable machine codes:

- `QUEUE_OUTSIDE_EFFECTIVE_HOURS`;
- `QUEUE_DAY_UNOPENED`;
- `QUEUE_DAY_CLOSED`;
- `QUEUE_INTAKE_PAUSED`;
- `QUEUE_DAY_OVERDUE`;
- `QUEUE_STATE_CHANGED`;
- `QUEUE_RECONCILIATION_UNAVAILABLE`;
- `QUEUE_LOCATION_FORBIDDEN`;
- `QUEUE_PAYMENT_TICKET_BLOCKED`.

Return `409` for valid state conflicts and stale expected versions, `403` for
permission failures, and a retryable `503` when reconciliation cannot establish
trustworthy state after bounded database retries.

Mutation responses retain the current `snapshot` shape and may add a
`transition` summary. Do not require a client to reconstruct state from the
mutation it requested.

### Platform Admin recovery APIs

Add separate Platform Admin routes for:

- privacy-minimized Queue Day diagnostics;
- idempotent reconciliation retry;
- notification-intent requeue;
- allowlisted repair preview and MFA-confirmed execution.

Do not reuse vendor open/close/reopen routes or `tenant.queue.operate`.

### Shared type rollout

Expand shared unions before any endpoint can emit new values:

- `TicketStatus += pending_carry_over | expired`;
- `BookingStatus += unfulfilled | missed`;
- Queue Day state/phase/reason types;
- additive ticket journey and operator capability types.

Audit every exhaustive switch, badge map, filter, test fixture, API client, and
status constraint before enabling writes. Unknown status rendering should
degrade to a neutral label during the compatibility release rather than crash.

## Ordered deployment

### Gate 0 — backup and preflight

1. Take/identify a restorable production backup.
2. Run `db:status` and `db:verify`.
3. Run the privacy-safe inventory and anomaly queries.
4. Confirm no applied migration is missing from the repo.
5. Stop if date-key, duplicate-sequence, or missing-location anomalies cannot
   be classified.

### Release A — expand, understand, do not enforce

1. Apply additive migrations while the current backend remains compatible.
2. Deploy shared types and backend/frontend code that understands every new
   state but leaves every location in `legacy`.
3. Add the new tables/repositories, dual-write/shadow instrumentation, and
   backfill command.
4. Keep old storefront structure and legacy Queue Day behavior visible.
5. Verify normal join, paid activation, booking check-in, vendor operations,
   snapshots, and SSE are unchanged.

### Backfill and shadow

1. Run the resumable backfill in bounded batches.
2. Resolve or explicitly quarantine every anomaly.
3. Move selected internal/test locations to `shadow`.
4. For each snapshot/mutation, compute the new decision and compare it with the
   legacy result without enforcing the new result.
5. Require zero unexplained differences for open/closed, pause, location date,
   nonterminal ticket set, and sequence allocation.
6. Run the reconciler in dry-run candidate mode and compare proposed outcome
   counts with reviewed inventory.

### Release B — enforce deliberately

1. Deploy the production backend, worker loops, outbox dispatcher, selected
   Option C vendor UI, and additive customer/public messaging with enforcement
   still off.
2. Confirm the deployed frontend build can manually open and operate a Queue
   Day before changing any location to `enforced`.
3. Enable one staffed test location, then a small tenant cohort, then the
   remainder.
4. At enablement, preserve an actively operating current-day legacy queue by
   importing it as open with its effective close deadline. Locations without
   affirmative current-day operation become unopened and require manual open.
5. Watch reconciliation backlog, outbox retries/dead rows, join conflict codes,
   payment-ticket blocks, and anomaly counts at every cohort.

### Release C — validate and retire legacy authority

1. Validate deferred foreign keys/check constraints and non-null guarantees.
2. Stop dual-writing closure/pause authority after every location is enforced.
3. Keep legacy tables/columns readable for history and rollback evidence.
4. Remove feature flags, old fields, or old tables only in a later explicitly
   approved cleanup—not in this lifecycle effort.

## Rollback limits

- Before enforcement, application rollback is safe because expansion is
  additive and legacy remains authoritative.
- During shadow, disable shadow work and keep the backfilled tables; do not
  delete evidence.
- After enforcement but before any new-only status is written, disable the
  location flag and return to the compatibility release.
- After `pending_carry_over`, `expired`, `unfulfilled`, `missed`, new outbox
  intents, or new Queue Day versions exist, do not deploy the pre-expansion
  backend. It cannot interpret the data safely.
- Database down-migration is not supported. Preserve rows and use a forward
  fix or the Release A compatibility build.
- Disabling workers never permits joins against an overdue/untrusted Queue
  Day; request-time guards continue to fail closed.
- Payment callbacks already recorded as paid must never be discarded during
  rollback. Blocked ticket issuance/refund follow-up remains durable.

## Verification gates

### Schema and backfill

- Fresh bootstrap plus every migration succeeds.
- Upgrade from a realistic pre-change snapshot succeeds.
- `db:status` is clean and `db:verify` checks new tables, indexes, constraints,
  and status definitions.
- Backfill is repeatable, resumable, and produces identical second-run counts.
- Every legacy closure/pause/ticket maps or appears in the reviewed anomaly
  table.
- No customer notification is sent by the backfill itself.

### Backend/domain

- Open eligibility covers same-day, overnight, 24-hour, closed, missing-hours,
  timezone, and less-than-15-minutes cases.
- All mutation entry points lock/reconcile the same Queue Day.
- Direct, OTP, paid, vendor walk-in, booking check-in, and skipped restore paths
  reject unopened, paused, closed, and overdue states consistently.
- Concurrent open/extend/close/reconcile/payment tests prove idempotency and
  lock order.
- Close applies the full ticket/booking outcome matrix once.
- Carry-over activation assigns a new segment/display number before ordinary
  joins; pending cancellation and activation race safely.
- Seven-day expiry, warning versions, events, and outbox keys deduplicate.
- Restricted reopen changes availability without reversing terminal outcomes.
- Permission tests cover Staff location scope, Admin/Owner reopen, and
  Platform Admin separation.

### API/client

- Old snapshot fixtures still deserialize using deprecated aliases.
- New public, customer, vendor, Platform Admin, and SSE snapshots expose only
  their allowed fields.
- Every new status has a neutral fallback plus intentional badge/copy.
- Mobile Option C countdown uses `currentClosesAt` and `serverNow`, survives
  focus/reconnect, and reflects another operator's extension/close.
- Vendor storefront/discovery/profile/service/booking layout remains unchanged;
  only queue status and join affordances reflect authoritative availability.

### Operational smoke

- Manual open → join → pause/resume → 15-minute/5-minute warning → 30-minute
  extension → close.
- Startup and request-time recovery of overdue Queue Days.
- First-close pending carry-over → later manual open → new display number →
  terminal expiry if unresolved.
- Seven-day pending expiry without an intervening open day.
- Paid callback after close records blocked issuance/refund follow-up and
  creates no ticket.
- Reconciliation failure locks actions and reaches Platform Admin diagnostics
  without leaking customer PII.
- Outbox provider retry, dead-letter visibility, requeue, and stale-warning
  obsolescence.

## Implementation cutline

The next backend implementation ticket may build:

- additive migrations and schema verification;
- Queue Day repository/domain commands and lock discipline;
- compatibility/backfill/shadow tooling;
- reconciliation and outbox workers;
- server-side permission split and guarded APIs;
- ticket/booking outcome persistence.

The later UI/notification implementation ticket owns:

- Option C production vendor interaction;
- manual-open, status, and permission-aware controls;
- customer/public queue availability copy;
- ticket journey/history presentation;
- notification templates and settings surfaces.

Neither ticket redesigns the vendor storefront or booking experience.
