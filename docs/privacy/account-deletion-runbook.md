# Account deletion operations

Workflow implementation update: 2026-09-28. Original request-admission work: 2026-09-07.
This is a staged, explicitly approved first-party cleanup workflow. The current scan covers numeric relational user-ID references; provider stores, copied identifiers, JSON, and backups remain unscanned and are never reported as deleted.
The customer initiates and confirms in the app; no support contact is required.

## What the code does

POST /api/account/delete uses the authenticated user ID only. It verifies the password server-side, or a Google/Facebook session authenticated within five minutes for accounts without a password. Five attempts per user/IP per 15 minutes are allowed. GET /api/account/deletion-options tells the app which verification is required.

One transaction durably records a unique request per user, removes the avatar reference and reviews, revokes sessions, disables web/mobile push and booking/ticket notification preferences, and makes queued ticket notifications obsolete. Waiting and pending carry-over tickets are cancelled atomically with acceptance, with terminal timestamps, closed queue segments and cancellation events. Called tickets remain for vendor handling; completed history is preserved. A concurrent call-next wins only if it changes the status before cancellation locks the ticket. Queue snapshots and capacity auto-resume refresh after commit. Already dispatched messages cannot be recalled. The response is HTTP 202 with a request reference and a 30-day deadline. The app clears saved login/biometric credentials and shows the receipt. Ordinary authenticated access and new/refresh sessions are rejected while deletion is pending. Only a still-unexpired access token revoked specifically by deletion can retry the same deletion POST, and must pass verification again.

The worker runs every minute, using a PostgreSQL advisory lock to serialize instances. It acknowledges requests independently of cleanup. An admin explicitly starts a read-only, repeatable-read numeric relational scan; the report records table/column names, counts, and opaque per-row checklist IDs, never raw primary keys. It times out after ten seconds and limits per-source item enumeration; sources without complete enumeration remain review-required. The Platform shows each reference item checked by default. Unchecking any populated reference blocks cleanup; stale reports, missing items, and unknown sources fail closed. Copied identifiers/JSON, object storage/CDN, suppliers, legal/financial decisions, and backups remain outside this scan.

Before mutating, the worker repeats the numeric-reference scan and verifies the exact item IDs approved by the administrator. In one transaction it applies explicit per-source rules: delete email-change challenges, idempotency rows, and recipient notices; clear accepted-by and event-actor links; preserve abuse reports while clearing reporter links and free-text details; preserve trust-rating rows but clear the deleted account's participant links, hide the rating, and clear private notes; freeze and privatize campaigns whose organizer account is deleted; minimize known customer fields on tickets/bookings and security-event identifiers; then delete the user. It verifies the user row is absent, known fields are scrubbed, and numeric references are zero before committing. Any stale row, unexpected source, FK restriction, or failed verification rolls back the entire transaction and leaves the request in `needs_attention`. These are best-effort relational de-linking rules, not a guarantee of irreversible anonymization: stored file evidence, copied identifiers, and unscanned JSON/object storage/backups may still identify a person. The generated report records the exact table-level actions and exclusions. The admin reviews it and separately queues email delivery; only provider acceptance marks the request complete. Minimal completed-request evidence expires after 12 months.

## Daily operator procedure

Use the intended environment's DATABASE_URL and a restricted operator identity. The CLI does not contain credentials. Do not put personal data, passwords, provider tokens, or private object URLs in evidence references.

1. In Platform → Users → Data deletion, select a request and choose **Begin account cleanup**. This queues a read-only scan; it does not erase data. The Platform worker and database migrations must be running.
2. Review every populated relational source and its individual references. Leave all reference items checked to approve the supported rules; an unchecked item pauses cleanup for separate review. Unsupported category-level inventory remains excluded with an explicit reason. Never bypass an unenumerated or unknown first-party reference.
3. Enter an audit reason and choose **Delete related data**. This queues one idempotent background transaction that applies the documented per-source best-effort rules. Monitor the request until cleanup is complete or needs attention. On a database constraint failure, the transaction rolls back; resolve the specific shared-record/ownership issue before retrying.
4. Review the resulting action report and exclusion list. The report is limited to known application actions and does not claim provider/backup deletion.
5. Enter a separate audit reason and choose **Send report to user**. Delivery is asynchronous. If it fails, retry report delivery only; do not rerun a successful cleanup. The request becomes completed only after email-provider acceptance.
6. Route `needs_attention`, overdue work, provider failures, and legal/retention questions to the responsible operator/DPO/CPA. Never fabricate evidence by using the legacy `attest` or `notice` CLI commands.

## Legacy task catalog (not the new workflow)

- **personal_data_inventory:** find and erase copied identifiers and user content in queue/booking events and notes, OTP payloads/delivery targets, mobile OAuth response bodies, notification payloads/outbox, support tools, ratings/private trust notes, and other stores. Review the separate automated relational inventory, search by stable user ID plus confirmed email/phone/username variants, and avoid deleting another person's data sharing an address. Final SQL handles user-linked cascade rows and copied ticket/booking contact fields; it does not exhaustively scrub arbitrary JSON or external tools.
- **object_storage_versions_and_caches:** remove every avatar version under `user-avatars/users/USER_ID/`, proof/upload objects that lack a retention basis, and cached public copies. A cleared database URL or object delete marker is not proof of version erasure. Preserve only legally necessary documents in restricted storage with an expiry. Verify B2/CDN cache controls, including previously immutable avatar responses.
- **supplier_data:** complete deletion of GetPrio-controlled data held by processors, including messaging installations where applicable. Track each supplier's confirmation and retained categories/periods. Google Analytics and ad SDKs require inventory updates when actually introduced. Current auth supports Google/Facebook; if Sign in with Apple is added, implement token revocation before release.
- **financial_and_legal_retention:** maintain a restricted exception register with minimal fields, purpose, legal basis, accountable owner and expiry/review date. Establish applicable accounting records with the accountant; the BIR period is not blanket retention for profiles. Preserve required campaign/contribution/refund records before user cascades; resolve restrictive ownership references. Review specific legal holds every 90 days.
The six `account_deletion_tasks` rows and `attest`/`notice` CLI commands are retained for migration compatibility, but no longer drive the new worker and are not visible as operator prerequisites in the dashboard. Their presence is not evidence that the corresponding categories were processed. The new cleanup report explicitly records categories outside the worker's allowlist as excluded. The external-system requirements above remain release/integration work, not manual attestations to make a request appear complete.

## Production release checks

New requests are disabled by default. Set ACCOUNT_DELETION_ENABLED=true only after these operational checks pass and the updated mobile build is available. Disabling admission later does not stop already accepted requests or their retries. The worker continues processing existing requests; missing email configuration defers processing and records EMAIL_NOT_CONFIGURED.

- Apply the deletion-request migration, `20260928_add_account_deletion_automation_report.sql`, and `20260928_add_account_deletion_workflow_states.sql` before deploying backend queries that select the workflow/report fields. The bootstrap schema includes the same columns; never bootstrap an existing production database.
- Assign the operator, inventory all stores, verify backup lifecycle/CDN erasure and supplier controls, configure and test acknowledgement/completion email, and connect deadline/error logs to monitored alerts. The code does not configure these external services.
- Implement/verify the 90-day ordinary log lifecycle in each database/log provider. This patch does not impose a blanket purge on audit chains or records under a specific legal hold.
- Publish the approved retention policy only when operations can meet it. Do not claim complete legal compliance from unit tests; confirm applicable accounting obligations and markets.
- Run a dedicated disposable account through deployed password and provider flows, including wrong password, accepted request, disabled access/push, actual external deletion, retained records, completion email and restore replay.
- Ship a new signed iOS build. Existing TestFlight v1.0.1 build 2 lacks these changes.

## Local verification

The integration test refuses nonlocal databases or a database name other than getprio_deletion_test. Create a disposable PostgreSQL 16 database, bootstrap it and apply migrations, then set ACCOUNT_DELETION_TEST_DATABASE_URL and run:

`node --test backend/tests/accountDeletion.integration.test.cjs`

It verifies wrong-password rejection, rollback, duplicate request identity, session revocation/retry scope, passwordless verification, and the approved transactional relational cleanup. It does not verify the admin HTTP workflow, external suppliers/backups, or actual email-provider delivery; the corresponding mocked API/worker tests are separate evidence.

## Scoped avatar-origin cleanup

For an accepted, incomplete deletion request, use:

```sh
node scripts/account-deletion.mjs avatars REQUEST_UUID
node scripts/account-deletion.mjs avatars REQUEST_UUID --apply
```

The first command previews counts only. `--apply` permanently deletes each listed avatar version and delete marker, then lists again to verify the origin prefix is empty. The account and exact `user-avatars/users/USER_ID/` prefix come from the deletion request, never a supplied URL or arbitrary prefix. It includes older replaced avatars. Listings are paginated before mutation; invalid metadata, excessive/repeated pagination, provider errors/locks or remaining versions fail the operation. Retry safely after resolving failures; already completed provider deletions cannot be rolled back by a database transaction. Do not run against a real request merely to test tooling.

The command holds the same user-row lock used by deletion acceptance and avatar upload. Updated upload code must be deployed to every API instance, with older in-flight uploads drained, before relying on this protection. Missing/deletion-disabled accounts cannot upload; uploads already holding the lock finish before deletion acceptance. A failed upload/database commit can leave an orphaned avatar, which the user-prefix cleanup also includes.

**This command does not attest `object_storage_versions_and_caches`.** Other uploads, legally retained proof records and cache checks remain separate operator work. Record only a restricted case/job reference after those checks succeed; never paste object keys, private URLs or credentials into evidence. Failed origin cleanup must leave the task pending.

New avatar uploads use `Cache-Control: no-store`. This does not retroactively clear earlier one-year immutable responses, device image caches, saved files or CDN overrides. Inventory delivery URLs and controlled cache layers; purge affected managed CDN entries and verify the effective response policy using synthetic files. Document any inaccessible legacy copies and their original expiry; escalate rather than asserting complete cache erasure. A missing origin object alone is insufficient evidence. STASH copies follow their separately verified backup expiry and deletion-replay procedure.

Provider semantics: [Backblaze version listing](https://www.backblaze.com/apidocs/s3-list-object-versions), [version-specific deletion](https://www.backblaze.com/apidocs/s3-delete-object), and [HTTP cache controls](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control). Local synthetic tests establish code behavior only; actual provider permissions, lock behavior, delivery/cache overrides and end-to-end deletion require separate deployment verification.

Run `AVATAR_CLEANUP_TEST_DATABASE_URL=postgresql://.../getprio_avatar_cleanup_test node --test backend/tests/avatarDeletionConcurrency.test.cjs` against a disposable localhost PostgreSQL database to verify the upload holds a real row lock during its synthetic storage write, origin cleanup succeeds after deletion acceptance, and a later upload cannot recreate the avatar. This test creates and removes its own schema; the URL is restricted to that database name and localhost. It does not connect to Backblaze.
