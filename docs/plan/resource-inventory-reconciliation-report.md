# Resource inventory and historical reconciliation report v1

Refs [AI Wait-Time Prediction #378](https://github.com/munkyboi/getprio/issues/378), Stage B. This internal report provides reviewable source evidence before authoritative snapshot readiness can be implemented. It does not declare full writer coverage or an activation policy.

## Boundary

`createResourceInventoryReconciliationReport({ pool, sourceBinding, authorize })` returns `readReport({ tenantId, locationId, windowFrom, windowTo })`. The internal module retains no application pool import. The Platform Admin adapter supplies the application pool, fixed source binding and trusted scope authorizer. The read-only HTTP/view integration described below does not provide dataset export or producer integration.

The version is `resource-inventory-reconciliation-report-v1`, distinct from the accepted forecast snapshot contract. Every result keeps `readiness: not_ready`, `snapshot: null`, and `authoritativeInventoryComplete: false`. A successful scan means bounded source rows were read coherently; it cannot be passed as a ready snapshot. Resource tracking and writer coverage remain constrained to false. The existing operational producer is unchanged.

## Observation and bounded reads

The window uses explicit canonical UTC instants, contains the database observation, and spans at most 480 minutes. Observation reads use one PostgreSQL repeatable-read, read-only transaction. `observedAt` is its database transaction timestamp. A separate bounded read-only authorization checkpoint after commit rejects grants revoked during the observation; `completedAt` only records completion and never refreshes the inventory's observation or revisions.

Each statement defaults to a 1,000 ms statement timeout and 100 ms lock timeout. Trusted constructor overrides can only choose 1–1,000 ms and lower row limits. Maximums are 100 pools, 10,000 requirements, work, allocations, released historical conversions and queue days, and 20,000 booking items, bindings and active segments. Output is bounded to 2 MiB. Counts are exact scoped decimal strings, independent of bounded finding examples. Any row overflow suppresses all detail and finding evaluation, retaining exact counts. Byte overflow suppresses detail and finding counts. Storage/timeout failures return counts unavailable, never zeros. Other read failures are sanitized errors.

The limits bound individual reads and returned bytes; they are not a hard whole-request latency or PostgreSQL memory guarantee. A timeout is evidence that the source could not be assessed.

## Retained source facts

- Work includes waiting, called, recoverable skipped, pending carry-over, explicit timing-open tickets and every ticket with an unreleased allocation across queue dates, independent of customer claim.
- All unreleased allocations remain held, including overdue expected ends. Unknown ends in legacy input remain unknown. Expected end never releases capacity.
- Underlying booking items overlapping the window and those linked to inventoried work/held allocations are reconciled even when there are zero ledger reservations. Pending expiry is classified without writing expiry.
- Window-overlapping unconverted protection is distinct from linked bindings outside the window and converted bindings. Converted protections never count twice as reserved capacity. Released allocations linked to reservation/conversion evidence are scanned regardless of current binding state; missing or altered binding state is reported. These historical records are scanned in a separate bounded collection and validate frozen demand, timing and booking lineage. Missing historical plan/start evidence remains an evidence gap. Released conversions never count as held capacity.
- Queue-day/segment priority, sequence, arrival, carry-over and version facts are retained. They do not establish a global cross-day dispatch order or a complete horizon.
- Frozen plan items are sanitized. Their SHA-256 sanitized projection fingerprint is not a monotonic revision; capturedAt is a stored fact. Aggregate configuration revision and plan revision remain null/unavailable. Actual ledger, pool, requirement and queue-day revision facts are preserved.

Capacity comparisons retain all observed held units and compare half-open protected intervals using PostgreSQL microsecond endpoint and observation values. Displayed ISO timestamps have millisecond precision; exact microseconds are internal comparison evidence. Protected-only conflicts compare exact intervals. Held-plus-protected conflicts only consider observation-forward intervals and are potential evidence gaps: current occupancy does not prove future occupancy. Past-only protections cannot conflict with current held demand. No expected end implies release or availability.

## Findings and privacy

Finding counts identify record type and classification: integrity differences, forecast support gaps, evidence gaps, or potential unadmitted demand. Missing optional legacy service starts are historical evidence gaps, not invented occupancy or corruption. An eligible booking without protection while tracking is disabled is potential unadmitted demand for activation review, not proof that currently disabled admission malfunctioned. Bundles, unmapped demand, stale plans, unknown provenance and carry-over uncertainty remain visible.

At most 32 finding examples are returned. `examplesComplete` distinguishes these examples from full counts; count-limit failures are not evaluated. Historical counts cover scoped stored history, not an approved production dataset or traffic provenance assertion.

Default output excludes customer names, contacts, user identities, notes, payment proof keys, lookup codes, arbitrary plan JSON and auth material. Qualified stable work/session/booking-item identifiers and timestamps remain linkable private transactional data. Access must be role-scoped; this report gives no capture, export, anonymization, repair or retention approval.

## Platform Admin operator view

The AI Inference page includes a private **Resource inventory and reconciliation** card. Search for a vendor/location, select the exact branch, review the explicit UTC window (at most eight hours, containing the database observation), then load manually. There is no polling or automatic report load. Changing search, scope or window clears the result; late responses cannot overwrite a newer request. A new request is needed to refresh evidence. Displayed timestamps retain millisecond precision; capacity checks use internal PostgreSQL microseconds.

`GET /platform/resource-inventory/scopes?q=...` returns at most 50 named location choices. `GET /platform/resource-inventory/report?tenantId=...&locationId=...&windowFrom=...&windowTo=...` accepts only these scalar fields. Repeated parameters, unknown fields and client-supplied limits/configuration are rejected. Both endpoints set `Cache-Control: no-store` and require `platform.resource_inventory.read`, assigned only to Platform Admin; release observers, vendors and customers are excluded.

The adapter queries current database role, deletion/suspension, MFA enrollment, session ownership/surface/status/MFA and all session expiry deadlines. Exact tenant/location existence is checked at observation and fresh authorization checkpoints. An additional bounded read-only checkpoint covers unavailable results too. These checks detect revocation visible at the checkpoint; they do not hold authority locks through HTTP delivery. Connection/read failures are sanitized.

The view preserves exact decimal counts, unavailable/null values, row/byte suppression and at most 32 finding examples. Details are opened manually and paginated in groups of 25; released conversion history stays separate from held allocations. Complete scans remain `not_ready`; no available-capacity forecast, tracking activation, repair, export, capture or customer estimate change is provided. Stable IDs and timestamps remain private linkable operational data.

The adapter tests cover fresh authorization, cross-scope rejection, forbidden query shapes, missing storage, bounded search and revocation during unavailable report delivery. The dashboard tests and local browser fixture cover complete/unavailable/limit rendering, UTC validation, scope/window changes, late requests, access expiry, responsive layouts and both themes. Local fixtures make no production requests. Deployment and a live scoped report invocation are separate verification steps.

## Verification commands

`backend/tests/resourceInventoryReport.test.cjs` covers unsupported/missing plans, sanitization, unknown/overdue held occupancy, count overflow and input validation. Real PostgreSQL cases use an explicit disposable loopback database and the official pool/ledger migrations with disabled constraints preserved. Cases verify unbound underlying booking demand, expired pending items, linked conversion outside the window, historical explicit-start gaps, exact scope, read-only execution, repeatable-read coherence, grant revocation, row/byte overflow and count-query lock timeout.

Run real cases with `RESOURCE_LEDGER_TEST_DATABASE_URL` pointed only to an explicit loopback `getprio_test` or `getprio_ledger_test` database. No report test connects to application configuration or a production database.
