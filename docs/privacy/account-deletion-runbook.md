# Account deletion operations

Implementation date: 2026-09-07. Backend branch: codex/account-deletion.
This is an operator-assisted deletion workflow, not fully automatic erasure of every data store.
The customer initiates and confirms in the app; no support contact is required.

## What the code does

POST /api/account/delete uses the authenticated user ID only. It verifies the password server-side, or a Google/Facebook session authenticated within five minutes for accounts without a password. Five attempts per user/IP per 15 minutes are allowed. GET /api/account/deletion-options tells the app which verification is required.

One transaction durably records a unique request per user, removes the avatar reference and reviews, revokes sessions, disables web/mobile push and booking/ticket notification preferences, and makes queued ticket notifications obsolete. Waiting and pending carry-over tickets are cancelled atomically with acceptance, with terminal timestamps, closed queue segments and cancellation events. Called tickets remain for vendor handling; completed history is preserved. A concurrent call-next wins only if it changes the status before cancellation locks the ticket. Queue snapshots and capacity auto-resume refresh after commit. Already dispatched messages cannot be recalled. The response is HTTP 202 with a request reference and a 30-day deadline. The app clears saved login/biometric credentials and shows the receipt. Ordinary authenticated access and new/refresh sessions are rejected while deletion is pending. Only a still-unexpired access token revoked specifically by deletion can retry the same deletion POST, and must pass verification again.

The worker runs every minute, using a PostgreSQL advisory lock to serialize instances. It acknowledges requests by email, waits for all five documented cleanup tasks and a retention notice, then scrubs ticket/booking contact fields and deletes the user in a transaction. Foreign-key restrictions or cleanup errors keep the request incomplete. Completion email is sent only after that transaction commits; email failure retries. The restricted contact address is cleared after successful delivery. Minimal completed-request evidence expires after 12 months.

## Daily operator procedure

Use the intended environment's DATABASE_URL and a restricted operator identity. The CLI does not contain credentials. Do not put personal data, passwords, provider tokens, or private object URLs in evidence references.

1. Run `node scripts/account-deletion.mjs list` and `node scripts/account-deletion.mjs tasks REQUEST_UUID`. Assign an operator immediately; complete well before the deadline. Monitor the server's account-deletion-deadline and account-deletion-worker errors. Route them to the existing production alerting system before release.
2. Resolve outstanding booking, queue, payment, vendor ownership and campaign obligations. Do not require the user to retain an active account. Transfer legitimate business ownership or isolate specifically required records. Do not delete another party's records blindly.
3. Complete every task below. A task is an attestation of work actually performed, not a shortcut to bypass it. Record an access-controlled job/case reference, not the data that was erased.
4. Run `node scripts/account-deletion.mjs attest REQUEST_UUID TASK_KIND EVIDENCE_REFERENCE` for each completed task. Operator database access must be audited by infrastructure.
5. Run `node scripts/account-deletion.mjs notice REQUEST_UUID "Plain-text retention explanation"`. Explain actual retained categories, purpose/legal basis and expiry, including restricted backups awaiting disposal. Say explicitly if no exceptions apply. Do not include other people's personal data.
6. The worker completes the transaction on its next run. To run now: `node scripts/account-deletion.mjs run`. Confirm completion and email delivery. Do not mark external tasks done if a provider deletion failed; retry that work and keep the task pending.

## Required task evidence

- **personal_data_inventory:** find and erase copied identifiers and user content in queue/booking events and notes, OTP payloads/delivery targets, mobile OAuth response bodies, notification payloads/outbox, support tools, ratings/private trust notes, and other stores. Search by stable user ID plus confirmed email/phone/username variants; avoid deleting another person's data sharing an address. Final SQL handles user-linked cascade rows and copied ticket/booking contact fields; it does not exhaustively scrub arbitrary JSON or external tools.
- **object_storage_versions_and_caches:** remove every avatar version under `user-avatars/users/USER_ID/`, proof/upload objects that lack a retention basis, and cached public copies. A cleared database URL or object delete marker is not proof of version erasure. Preserve only legally necessary documents in restricted storage with an expiry. Verify B2/CDN cache controls, including previously immutable avatar responses.
- **supplier_data:** complete deletion of GetPrio-controlled data held by processors, including messaging installations where applicable. Track each supplier's confirmation and retained categories/periods. Google Analytics and ad SDKs require inventory updates when actually introduced. Current auth supports Google/Facebook; if Sign in with Apple is added, implement token revocation before release.
- **financial_and_legal_retention:** maintain a restricted exception register with minimal fields, purpose, legal basis, accountable owner and expiry/review date. Establish applicable accounting records with the accountant; the BIR period is not blanket retention for profiles. Preserve required campaign/contribution/refund records before user cascades; resolve restrictive ownership references. Review specific legal holds every 90 days.
- **backup_disposal:** verify backup lifecycle can meet the approved 35-day expiry after active erasure, record the last-copy expiry date, restrict restore access and test replay of deletions before serving restored data. The completion notice must disclose any restricted backup copies awaiting expiry. This task attests the enforced lifecycle and restore procedure, not immediate physical expiry of every backup.

## Production release checks

New requests are disabled by default. Set ACCOUNT_DELETION_ENABLED=true only after these operational checks pass and the updated mobile build is available. Disabling admission later does not stop already accepted requests or their retries. The worker continues processing existing requests; missing email configuration defers processing and records EMAIL_NOT_CONFIGURED.

- Apply the migration before deploying backend queries that select deletion_requested_at. The bootstrap schema includes the same tables; never bootstrap an existing production database.
- Assign the operator, inventory all stores, verify backup lifecycle/CDN erasure and supplier controls, configure and test acknowledgement/completion email, and connect deadline/error logs to monitored alerts. The code does not configure these external services.
- Implement/verify the 90-day ordinary log lifecycle in each database/log provider. This patch does not impose a blanket purge on audit chains or records under a specific legal hold.
- Publish the approved retention policy only when operations can meet it. Do not claim complete legal compliance from unit tests; confirm applicable accounting obligations and markets.
- Run a dedicated disposable account through deployed password and provider flows, including wrong password, accepted request, disabled access/push, actual external deletion, retained records, completion email and restore replay.
- Ship a new signed iOS build. Existing TestFlight v1.0.1 build 2 lacks these changes.

## Local verification

The integration test refuses nonlocal databases or a database name other than getprio_deletion_test. Create a disposable PostgreSQL 16 database, bootstrap it and apply migrations, then set ACCOUNT_DELETION_TEST_DATABASE_URL and run:

`node --test backend/tests/accountDeletion.integration.test.cjs`

It verifies wrong-password rejection, rollback, duplicate request identity, session revocation/retry scope, passwordless verification, missing-task failure and final relational erasure. It does not verify external supplier or email delivery.
