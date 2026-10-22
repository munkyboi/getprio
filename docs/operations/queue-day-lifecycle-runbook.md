# Queue Day Lifecycle Rollout and Recovery Runbook

Status: verified for MVP rollout on 2026-07-31.

This runbook covers the authoritative, location-scoped Queue Day lifecycle,
stale-ticket recovery, notification delivery, and the legacy-to-enforced
rollout. It does not change recurring store hours, booking availability, or the
public storefront layout.

## Safety invariants

- Store hours make a Queue Day eligible; staff still open it manually.
- A Queue Day is only `unopened`, `open`, or `closed`. Intake pause and
  auto-close phase are separate facts.
- Open Queue Days retain their timezone and Effective Store Hours snapshots
  even if recurring store hours are edited later.
- Every warning, extension, close, ticket outcome, retry, and repair is
  idempotent and auditable.
- A waiting Queue Ticket may carry over once. A second unresolved close or the
  seven-day pending window produces `expired`, never `cancelled`.
- Routine queue operation belongs to assigned Vendor Staff and Vendor
  Admin/Owner. Platform Admin recovery is exceptional, reasoned, allowlisted,
  MFA-confirmed, and audited.
- Never repair lifecycle data by editing ticket status, display number,
  Queue Day state, or event/outbox rows directly.

## Pre-deployment gates

1. Take a PostgreSQL backup and prove it can be restored to a separate database.
2. Keep the previous application release available.
3. Rehearse the exact release against a database whose name contains `smoke` or
   `test`.
4. Run:

   ```bash
   DATABASE_URL=postgresql://.../getprio_queue_smoke npm run db:bootstrap
   DATABASE_URL=postgresql://.../getprio_queue_smoke npm run db:status
   DATABASE_URL=postgresql://.../getprio_queue_smoke npm run db:verify
   DATABASE_URL=postgresql://.../getprio_queue_smoke npm run smoke:queue-lifecycle
   ```

   `smoke:queue-lifecycle` refuses other database names. It creates and removes
   its own tenant fixture and verifies manual opening, store-hours snapshot
   immutability, warning extension, close outcomes, reopen/re-close, one-time
   carry-over, both expiration paths, concurrent reconciliation, notification
   dead-letter/requeue, and cross-timezone recovery.
5. Run the complete application suite:

   ```bash
   npm run typecheck
   npm run lint
   npm run test:backend
   npm run test:frontend
   npm run build
   ```

## Legacy backfill rehearsal

Run the backfill only after migrations and schema verification. Start with a
disposable restored copy of production:

```bash
DATABASE_URL=postgresql://.../getprio_queue_smoke \
QUEUE_LIFECYCLE_BACKFILL_BATCH=25 \
npm run db:backfill:queue-lifecycle
```

Inspect `queue_lifecycle_backfill_runs` and
`queue_lifecycle_migration_anomalies`. Do not enforce a location while its run
has unresolved anomalies. The backfill preserves anomalous records rather than
guessing customer outcomes.

If a run stops, resume its durable zero-padded cursor:

```bash
DATABASE_URL=postgresql://.../getprio_queue_smoke \
QUEUE_LIFECYCLE_BACKFILL_RUN_ID=<run-id> \
npm run db:backfill:queue-lifecycle
```

Re-running or resuming is idempotent. A production rehearsal must confirm:

- every valid legacy scope has one Queue Day;
- every legacy ticket has its original Queue Day and inferred segment;
- duplicate daily sequences and invalid date keys remain listed as anomalies;
- customer contact and lookup-code data never appears in anomaly details.

## Production rollout

Roll out one location at a time:

1. Deploy the additive migrations with the location still in `legacy`.
2. Run `db:status`, `db:verify`, and the legacy backfill.
3. Move the location to `shadow`. Compare
   `queue_lifecycle_shadow_difference` events and investigate every mismatch.
4. Confirm the lifecycle worker is running on startup and every minute.
5. Confirm staff assignment, Vendor Admin MFA, Web Push configuration, email
   delivery, SSE reconnect, and the public queue snapshot.
6. Move the location to `enforced`.
7. Have staff manually open its first Queue Day. Store hours must not open it.
8. Run the read-only role smoke:

   ```bash
   SMOKE_STAGE=queue \
   SMOKE_EMAIL=<vendor-admin-customer-fixture> \
   SMOKE_PASSWORD=<password> \
   VENDOR_STAFF_SMOKE_EMAIL=<assigned-staff-fixture> \
   VENDOR_STAFF_SMOKE_PASSWORD=<password> \
   PLATFORM_SMOKE_EMAIL=<platform-admin-fixture> \
   PLATFORM_SMOKE_PASSWORD=<password> \
   node -r dotenv/config scripts/smoke-test.mjs
   ```

The role smoke verifies public availability, customer ticket history, Vendor
Staff and Vendor Admin snapshots, and Platform Admin diagnostics without
mutating queue state.

## Monitoring

Use `GET /api/platform/queue-lifecycle/diagnostics` with
`platform.queue_lifecycle.read`. Alert on:

- open Queue Days whose deadline is past;
- `last_reconciliation_error` or increasing reconciliation attempts;
- unresolved tickets attached to closed Queue Days;
- notification intents in `dead`;
- a growing `pending`/`retry` outbox backlog;
- repeated shadow differences before enforcement.

Check worker startup logs after every backend restart. Missing the in-memory
timer is not destructive: startup, periodic, and request-time reconciliation
all use the same database-idempotent close command.

## Operator recovery

| Condition | Safe response |
| --- | --- |
| Warning delivery was missed | Refresh the vendor dashboard. The server deadline remains authoritative; the worker may emit the still-relevant five-minute warning. |
| Queue Day is overdue but still open | Retry the dashboard request, then use Platform Admin reconcile if normal request/startup reconciliation does not close it. |
| Reconciliation reports an error | Stop new queue mutations for that location, inspect diagnostics and logs, correct the underlying database/provider problem, then call the allowlisted reconcile action. |
| Reconcile still cannot establish a trustworthy state | Platform Admin previews the repair, records a reason, confirms recent MFA, and executes only the allowlisted repair. Preserve the before/after event history. |
| Notification intent is `retry` or `dead` | Correct the provider/configuration failure, then requeue the exact outbox ID through the Platform Admin endpoint. Never insert a duplicate intent. |
| Waiting ticket is `pending_carry_over` | Do not assign a position manually. It activates when staff opens the next eligible Queue Day or expires after seven days. |
| Carried ticket remains unresolved at the next close | Confirm the system recorded `expired` and notified the customer. Create a linked Replacement Queue Ticket only if vendor policy calls for accommodation. |
| Called ticket remains at close | Confirm `unserved` and the linked checked-in Booking’s `unfulfilled`/refund evidence. Do not rewrite it as cancellation. |
| Early manual close was accidental | Vendor Admin/Owner may reopen during the existing Queue Operating Window. Earlier outcomes remain final; reopening does not revive terminal tickets. |
| Store hours changed while a Queue Day is open | The open Queue Day keeps its snapshot. Apply the recurring change to future Queue Days; use an audited 30-minute extension for the current day. |

Platform recovery endpoints:

- `POST /api/platform/queue-lifecycle/:queueDayId/reconcile`
- `POST /api/platform/queue-lifecycle/notifications/:outboxId/requeue`
- `POST /api/platform/queue-lifecycle/repair/preview`
- `POST /api/platform/queue-lifecycle/repair/execute`

Repair execution requires the appropriate Platform Admin permission and
`x-mfa-confirmed: true`.

## Rollback

The database changes are additive, but ticket outcomes written by the new
lifecycle are forward-only facts.

- Before any location is enforced or new lifecycle outcomes are written, return
  that location to `shadow` or `legacy` and restore the previous application.
- After a location has written Queue Days, carry-over, expiration, unserved, or
  notification intent records, do not downgrade the schema, delete events, or
  infer legacy state from those rows. Keep the database and deploy a compatible
  roll-forward build.
- If the application must be rolled back after enforcement, pause external
  joins at the edge, keep the lifecycle worker/reconciliation path available,
  reconcile overdue Queue Days, and restore service with a build that
  understands the additive schema.
- Restore a database backup only for database loss/corruption, not to undo valid
  queue outcomes. Replaying customer-visible outcomes risks duplicates and
  conflicting service/refund records.

## Security and privacy verification

- Queue mutations require authenticated tenant permissions and assigned-location
  access; hiding controls in the UI is not authorization.
- Platform repair is separate from vendor operation and requires recent MFA.
- Public snapshots expose availability and queue progress, not customer contact
  data, notification destinations, repair notes, or provider errors.
- Web Push and email payloads contain status and navigation context, not payment
  evidence or sensitive customer details.
- Lifecycle events and outbox rows are accountability records. Restrict reads,
  retain them under the audit policy, and never place credentials or raw contact
  details in event metadata.
- Run active security testing only with written authorization and a defined
  staging scope.

## Verified evidence

The 2026-07-31 disposable-database rehearsal used batch size 1 across tenant IDs
9 and 10 to prove numeric cursor ordering. It produced two Queue Days, two
legacy-inferred segments, zero anomalies, and resumed the same completed run
without duplicate work. The lifecycle smoke produced three Queue Days, sixteen
events, and fifteen notification intents before deleting its fixture.
