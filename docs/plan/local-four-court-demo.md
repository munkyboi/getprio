# Local four-court pooled queue demonstration

This slice demonstrates real concurrent service execution in a disposable local database. It is not a production activation, authoritative forecasting producer, complete writer-coverage certification or pilot. The four courts are interchangeable units of one pool; allocations have real server identities, but no numbered-court assignment is invented.

## Execution contract

- Explicit local opt-in, development/test environment, loopback database URL and actual server identity, dedicated `getprio_local_pool_demo_*` database, and an exact fixture tenant/location marker are required. Ordinary dispatch keeps its current counter-lane behavior.
- Call moves the next eligible waiting ticket into a pending call. A pending unstarted ticket still occupies the call counter.
- Start uses the existing exact-ticket service endpoint and actual resource ledger. Once timing and a matching unreleased allocation exist, that call lane can call another ticket in the isolated scope. A timing timestamp alone never frees it.
- Capacity is enforced atomically by Start, including protected reservations over the requested service interval. Point-in-time free capacity is advice, not permission to start. A full pool returns HTTP 409 and must be refreshed.
- Complete and Interrupt target the selected ticket, record the actual outcome and release its allocation. Duplicate matching outcomes are idempotent. Expected end does not release overdue occupancy.
- The local operational read model supplies coherent pool counts, pending calls, active allocation/session identities, waiting work, queue-day/counter advice and reconciliation issues. It is separate from the inference producer, which remains fail-closed.

## Local execution

The AI-owned fixture script creates a new database and private mode-0600 credential/environment artifact. Never apply its fixture exception or bootstrap to an existing/shared database. Only the new fixture database permits tracking; the writer-coverage false constraint remains.

The canonical backend launcher verifies the effective configuration and exact marker before binding **127.0.0.1:5007**. It uses the real application/authentication/routes and starts no external-provider/background jobs:

```sh
./node_modules/.bin/tsx scripts/local-pooled-queue-server.mjs /tmp/getprio-vd-sports-club-demo.json
```

The vendor frontend uses a separate process at **http://127.0.0.1:5187** with `VITE_API_URL=http://127.0.0.1:5007/api`. Its cookies do not replace the normal localhost preview login. Use the private fixture credentials and normal password/TOTP login; no production account is modified.

Against a freshly seeded fixture, the HTTP acceptance script exercises normal password/TOTP, cookie/CSRF authentication, real Call/Start/Complete/Interrupt endpoints and local reads:

```sh
./node_modules/.bin/tsx scripts/local-pooled-queue-smoke.mjs /tmp/getprio-vd-sports-club-demo.json
```

It leaves four real sessions active, one pending call blocked by full capacity and one waiting ticket for the visible demonstration. The seven recorded checkpoints cover empty capacity, four simultaneous allocations, fifth-start rejection, duplicate Complete, independent Interrupt, freed-capacity reassignment and the final visible state. Private sanitized evidence is written to `/tmp/getprio-local-pooled-http-evidence.json`; credentials and session tokens are not included.

## Acceptance and remaining boundaries

At the first integration checkpoint, 15 dispatch/guard tests and 204 existing service-session PostgreSQL regressions passed without skips. The real HTTP script passed all seven checkpoints: four distinct allocation IDs, no fifth allocation, independent release and reassignment with increasing ledger revisions. The AI-owned separate PostgreSQL harness covers five competing starts, overdue holding, release/reuse and protected-reservation conversion. Vendor UI integration and visual acceptance must be verified separately; backend evidence is not UI acceptance.

The operational read contract and tests are documented in [local resource operations](local-resource-operations.md). Unknown or inconsistent work remains visible and can block advice; a later caller must refresh and obey the mutation result. No client-derived capacity, fake session data, forecast-ready flag, customer prediction, real provider delivery, production policy change or named-court identity is introduced. Complete writer inventory, provenance/source epochs, historical reconciliation and production pilot acceptance retain their existing gates.

The launcher rejects populated email, SMS, push, payment, and object-storage credentials and blocks external fetch/socket destinations before importing the application. It starts no background workers. To authenticate and read current state without queue mutations, add `--observe-only` to the smoke command; authentication still creates normal session/security records. Do not rerun the full smoke against an in-use fixture.

## Starting tickets without a service plan

In a tracked resource pool, Start requires the ticket to carry the frozen single-item known executable service plan captured at issuance. A generic walk-in with no selected service must be rejected before allocation; the server must not choose a default service or mutate the ticket plan. The operations UI should inspect the read model's `plan` and disable Start when the item count, service identity, duration, pool identity, or known-resource flag is not executable, with an inline explanation to issue a replacement ticket with a service selected. The supported recovery is to resolve the original through the normal queue action, then issue a replacement walk-in with an active service; the original remains in history. Capacity, ledger revision, and existing allocations must remain unchanged on the rejected Start.

The local pooled queue has no deferred-service workflow. Therefore queue admission itself must require a valid active service selection for this fixture scope, and must capture the executable plan in the same transaction as ticket creation. Missing, inactive, cross-branch, or resource-unknown services are rejected before a ticket row is accepted. Booking check-in remains valid only when its booking already supplies a protected executable plan; other callers must not bypass this admission rule.

## Editing waiting and called ticket details

The first edit operation changes the ticket's `customerName` and `notes` only. Email and phone remain read-only because they are notification/verification destinations; changing them requires an existing verified contact-change contract. Service selection captures a frozen resource plan at issuance, so service, quantity, duration, resource demand and booking/payment data remain read-only.

Use the existing `tenant.ticket.update_state` permission and current branch assignment. Read exact scoped ticket details with an opaque version preserving the database timestamp precision. A save supplies that version and the status observed when opening the editor. Inside the existing branch transaction, lock the exact ticket and recheck authorization, version, status, queue-day operation eligibility, service timing and live allocations. Only waiting or called tickets with no started service and no unreleased allocation can change. Reject stale edits or a concurrent Call/Start/terminal transition with a clear conflict; retain the user's draft and require refresh rather than automatically retrying.

Acceptance must show persisted name/notes edits separately for waiting and called tickets, untouched ticket number/position/status/plan/booking/payment, rejection of unsupported fields and cross-branch access, and a real Start-versus-save race. If Start wins, Save must fail without changing the active allocation. If Save wins, Start must consume the unchanged resource plan. Audit records should identify changed field names and actor without copying contact/free-text values into metadata. Existing active fixture allocations and event history must survive integration and restarts.

## Local image upload persistence

The fixture-only filesystem adapter additionally requires the explicit launcher argument `--local-image-storage`. The launcher clears inherited adapter opt-in unless this argument is present; the adapter must independently verify the disposable database and exact fixture scope on writes and reads. This does not enable B2 or other external providers. Payment QR acceptance requires a real browser upload, saving the returned asset through existing settings, and rendering the stored image after reload. Byte/MIME validation and external network restrictions remain active.
