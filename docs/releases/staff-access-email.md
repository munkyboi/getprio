# Staff access email release

Prepared on 13 September 2026 from production base `a6f38d4` on branch `codex/staff-access-email-release`.

## Scope

The vendor staff add, edit and remove routes save a notification intent in the same transaction as the access change. Unchanged access emits no notice. The affected verified account receives its own notice, including after removal; active verified owners receive a notice when another person performs the change. The worker rechecks recipient email and owner authority before sending. No customer information is included.

This release contains only the staff routes, transaction service, worker, Resend variable contract, additive migration and related tests. It excludes the developer portal prototype, pagination, booking email changes and unrelated frontend work.

## Deployment order

1. Review this isolated diff and run CI against its final commit.
2. Keep `STAFF_ACCESS_EMAIL_ENABLED` unset or `false` during deployment. This is the default. Existing Resend credentials and verified sender configuration are reused; no new credentials are required.
3. Apply `database/migrations/20260912_add_staff_access_email_outbox.sql` through the normal `npm run db:migrate` process. It must precede the updated backend. The current production deployment workflow already runs migration and schema verification before the API restart.
4. Deploy/build the backend and verify the staff routes with dedicated test accounts while automatic delivery is still off. Verify successful changes and rollback behavior, then inspect the saved intents. Do not use a real employee account for a removal test.
5. Review pending intent recipients and ages before any activation. Activation is a separate step: set `STAFF_ACCESS_EMAIL_ENABLED=true`, restart the API with updated environment, and verify the controlled test event through provider delivery records and the intended inbox. Publishing a template alone does not enable the worker.

No migration or backend deployment has been performed as part of this preparation.

## Managed templates

| Event | Published Resend alias | Template ID |
| --- | --- | --- |
| Access added | getprio-vendor-staff-added | 0ce3e67f-292d-40f3-8b7f-560ab3445841 |
| Access changed | getprio-vendor-staff-access-changed | df42d8b7-a5f1-4ad5-959f-4b252f2a03be |
| Access removed | getprio-vendor-staff-access-removed | d97591c8-0c99-4aaf-abd5-e01e619613d4 |

The templates were published and three fictional samples were delivered to the project owner's Gmail during prior verification. Required variables are defined in `backend/src/services/staffAccessResendTemplates.js`. Keep separate escaped HTML and plain-text name variables. Dashboard copy/layout edits may be published independently, but variable additions or renames require coordinated backend changes. Subject and sender remain supplied by the backend.

## Worker operation and rollback

The worker processes at most ten intents every minute, claims rows exclusively across processes and makes at most six attempts, five minutes apart. A stable event/recipient idempotency key is reused. Intents older than 23 hours stop automatically so retries stay within the provider's 24-hour deduplication window. Investigate failed or ambiguous intents before any manual resend; do not reset them blindly.

Operational read-only check:

```sql
SELECT status, COUNT(*) AS intents, MIN(created_at) AS oldest
FROM staff_access_email_outbox
GROUP BY status;
```

Disable `STAFF_ACCESS_EMAIL_ENABLED` and restart with updated environment to stop future worker passes. A send already in flight may finish; disabling cannot recall an accepted email. If rolling back the backend, leave the additive table intact to preserve delivery evidence and queued events. Do not drop the table as an application rollback step.

## Verification commands

```sh
npm run test:backend
npm run typecheck:backend
npm run build:backend
npx eslint backend/src/routes/vendorManagementHandlers.js backend/src/routes/vendorRoutes.js backend/src/server.ts backend/src/services/notificationService.js backend/src/services/staffAccessEmailService.js backend/src/services/staffAccessEmailWorker.js backend/src/services/staffAccessResendTemplates.js
RUN_STAFF_EMAIL_DB_TESTS=true node --test backend/tests/staffAccessEmail.integration.test.cjs
```

The integration test requires the existing local database schema. It rejects remote database hosts, creates its own random schema, uses fictional records and a mock sender, and removes its schema afterward. It is opt-in during normal unit tests. It covers actual repositories, transactions and worker SQL, but does not substitute for deployed HTTP-route verification. No extra emails were sent during release preparation.

## Local release verification — 2026-09-13

- Backend suite: 539 passed, 5 skipped, 0 failed (544 total). Ran all `backend/tests/*.test.cjs` with only the configured local `DATABASE_URL` supplied; loading the entire development environment also enables unrelated feature flags and is not equivalent to the suite's default configuration.
- Staff email PostgreSQL integration: all 8 scenarios passed (9 results including the parent). Used an isolated temporary schema and mocked provider delivery.
- Backend typecheck, build, scoped ESLint and whitespace checks passed.
- Added the outbox to the clean-slate bootstrap drop list, as required by the existing migration coverage test. The bootstrap SQL was not executed.
- No production migration, deployment, worker activation or additional email sends performed during release preparation.
