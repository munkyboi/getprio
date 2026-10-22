# Verify rollout, operations, and stale-ticket recovery

Type: task
Status: resolved
Claimed by: Codex (/root)
Blocked by: 08, 09

## Question

Prove that the implemented lifecycle behaves safely across real queue operations, legacy data, deployment failure, and every supported viewport and role, then document how operators recover from exceptional states.

## Completion requirements

1. Test manual open through warning, extension, atomic close/reconciliation, carry-over, next-day open, and expiration end to end.
2. Test downtime across closing and midnight, repeated/concurrent reconciliation, notification retries, store-hours edits, overnight hours, closed days, and location timezones.
3. Verify legacy stale-ticket migration and an operator-safe repair path using disposable fixtures before any live-like data.
4. Extend the headless smoke harness and validate public, customer, Vendor Staff, Vendor Admin, and Platform Admin behavior.
5. Verify mobile, keyboard, accessibility, SSE reconnect, refresh, and short-viewport behavior.
6. Update lifecycle, deployment, security, and operational-recovery documentation with rollout and rollback evidence.

## Resolution

Verified the authoritative Queue Day lifecycle and completed its rollout and
recovery safeguards:

- Added a database-guarded lifecycle smoke that exercises manual opening,
  immutable hours snapshots, warning extension, deterministic atomic outcomes,
  idempotent close, reopen/re-close, next-day activation, both expiration paths,
  concurrent downtime reconciliation, cross-timezone recovery, and notification
  dead-letter/requeue. Its disposable rehearsal produced three Queue Days,
  sixteen lifecycle events, and fifteen outbox intents before fixture cleanup.
- Rehearsed a batch-size-one legacy backfill across tenant IDs 9 and 10, proving
  stable numeric cursor ordering, two Queue Days, two inferred segments, zero
  anomalies, and resumability without duplicate work.
- Extended the read-only headless smoke to verify public, customer, Vendor
  Staff, Vendor Admin, and Platform Admin queue views. The live local role smoke
  passed and its synthetic tenant/users were removed.
- Corrected reopen metadata reset, explicit database environment precedence,
  Docker-based `psql` fallback, macOS Bash 3 status portability, resumable
  zero-padded backfill cursors, worker recovery after a failed scan, and
  EventSource automatic reconnect on public/customer queue pages.
- Preserved the mobile/desktop, short-viewport, keyboard, focus-return,
  accessibility, reload, and multi-section evidence from the production UI
  verification in the preceding implementation ticket, and added automated SSE
  reconnect coverage.
- Added the Queue Day rollout/recovery runbook and updated lifecycle,
  deployment, rollback, and IAS security documentation.
- Verified 339 backend tests, 100 frontend tests, all workspace typechecks,
  backend/frontend/platform production builds, lint with no errors, schema
  status/verification on the disposable database, and `git diff --check`.
