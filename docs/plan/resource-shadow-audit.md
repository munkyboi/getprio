# Read-only resource shadow readiness preflight

After deployment, on the server checkout:

```sh
cd /var/www/getprio
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/resource-shadow-audit.mjs \
  --vendor-slug pickle-bois-burgadols \
  --location-slug main
```

The configured DATABASE_URL is loaded using the existing environment loader. Explicit DATABASE_HOST and DATABASE_NAME must match it before connecting. The connected database is checked again, and the requested vendor/location must resolve uniquely. CLI environment and database names do not establish isolation or the running API's settings. Never paste a credential-bearing URL into shared output.

This command performs one operator-authorized producer read and private inference attempt. It creates no queue tickets, reservations, allocations or prediction samples, enables no flags, and modifies no customer estimate. It reports the selected target, producer readiness, private sanitized fallback and zero samplesWritten. It deliberately uses a readiness probe rather than accepting a ticket reference. A future producer returning ready is refused; forecasting needs a separately reviewed target adapter. Successful CLI execution is not a rollout approval.

## Database and provider boundary

A dedicated pool of size one uses the existing SSL configuration and server session defaults for read-only transactions, a 1000 ms statement timeout, 500 ms lock timeout and 1500 ms idle transaction timeout. Connection acquisition is limited to 1000 ms; the client query timeout is 1500 ms. Location/target resolution happens before the private 1000 ms inference deadline. These defaults do not modify the running API pool.

The producer uses its existing repeatable-read, read-only transaction. Its authorizer rechecks canonical tenant/location identifiers, requested slugs and current database inside that transaction. The audit source binding is fixed server-side. The inference byte adapter only serializes the producer's bounded not_ready envelope; it never manufactures ready inventory or uses capacity-audit/timing data as occupancy.

Abort destroys the borrowed audit connection with idempotent release; acquisition rechecks the signal before and after obtaining a client. PostgreSQL statement/idle timeouts remain necessary because destroying a socket is not proof of immediate server query cancellation. The producer promise remains counted as outstanding until it settles. The pool is closed on exit, including timeout/failure.

## Interpreting the result

Current runtime is expected to return runtime_not_ready with reasons such as tracking_disabled and writer_coverage_incomplete, and potentially ledger_unavailable or inventory_incomplete. These come from the producer's read, rather than assuming readiness from a configuration form. Timeout/read failures return unavailable diagnostics with null prediction fields. Errors before inference print a generic message to avoid exposing database credentials or query details.

No service-start accuracy, authoritative ready occupancy, sample coverage, API hook or production rollout is established by this command. Continue the covered reservation/session/configuration writers and reconciliation in the runtime workstream before implementing a ready snapshot consumer/capture hook.

Authoring verification: Node syntax, focused ESLint and whitespace checks only. No local database connection, command execution, forecast, tests or live preflight was run. Hosted checks and an operator invocation after deployment remain separate evidence.
