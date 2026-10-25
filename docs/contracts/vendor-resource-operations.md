# Vendor resource operations snapshot v1

`GET /api/vendor/tenant/:tenantSlug/locations/:locationSlug/resource-operations/snapshot`

This additive **authenticated real-data** route is registered in the ordinary Vendor router. It does not activate, rename, or bypass the older `/resource-operations` fixture endpoint. The older route, services, database markers and loopback guards remain unchanged.

## Access and effects

Normal session, suspension and privileged MFA middleware applies. The service resolves the requested active tenant/location, rereads active membership and `tenant.queue.read` permission, and enforces a staff location assignment. A fresh read rechecks authorization and active status before returning. Missing/inactive location returns404; unauthorized membership/role/assignment returns403. Malformed scope returns400. Free and Pro authorized readers use the same contract. Read access and dispatch advice confer no booking, resource-write, plan-admission or billing entitlement.

The transaction is `REPEATABLE READ READ ONLY`, with a2000ms statement timeout and fixed search path. There are no inserts, repairs, locks, release jobs, receipt creation or capacity mutations. Overdue unreleased allocations remain held; elapsed expected time never completes service. Auth middleware may perform its ordinary session activity touch, independently of this read-only resource projection.

## DTO

`contractVersion: "vendor-resource-operations-v1"`; **no `localDemo` property**.

- `scope`: authenticated `tenantId`, `locationId` strings.
- `asOf`: transaction observation time; `ledgerRevision`: recorded scope revision, or `"0"` for an empty uninitialized scope. No ledger row is created by reading.
- `pools`: actual configured pools and their recorded allocation/protected/overdue counts, tracking/archive state, point-in-time available units and availability-quality reasons.
- `waiting`, `called`, `activeSessions`: bounded operational ticket/allocation projections. No customer names, emails, phones, account credentials, payment details or private booking metadata are exposed.
- `queueDay`, `readyWaitingCount`, `counterDispatch`: existing queue-day/booking-readiness/dispatch predicates. `dispatchAdviceOnly: true` and `availabilityMeaning: "observed_now_only_start_command_is_authoritative"`; starting service rechecks authoritative full-interval admission.
- `reconciliation`: observed inconsistencies only. Unknown/orphaned/expired/inconsistent demand makes affected availability unknown and blocks dispatch advice. It does not free or repair recorded demand.
- `forecastReadiness: "not_evaluated"` is not a future-booking availability guarantee.

Confirmed V4 booking promises are read independently of intake flags. Point-in-time overlapping promises contribute protected demand; an exact authoritative Queue hold covering the observation is deduplicated by tenant/location, ticket, selection, plan revision, pool/member/units and booking selection-revision binding. This follows existing scheduled-capacity semantics. Future-only promises do not consume current units; expired protected records stay recorded and require review. Installations lacking the additive booking table cannot contain these V4 promises; schema detection returns no V4 demand there. No booking state is changed.

## Bounds and failure behavior

Limits:50 pools;1000 allocations;1000 Queue reservations;1000 V4 booking promises;1000 ticket projections;100 counters. Queries request one sentinel row beyond their limit and fail409 rather than return partial data. JSON payload cap512KiB. Every resource query uses tenant/location parameters. Aggregate waiting count is separate from bounded loaded ticket count. `Cache-Control: no-store`.

## Frontend

`useResourceDashboard` and `useLocalPoolOperations` call the new route and validate the real contract. Dashboard data is additionally checked against selected tenant/location IDs. Queue consumers compare IDs against the current bootstrap snapshot. Legacy/local-demo DTOs are rejected by these read paths; no DTO is relabeled or cast into a fixture contract. Existing token/scope cache keys, abort signals, polling and scoped SSE invalidation remain. Reads no longer depend on DEV flags; the existing local UI/write-switch is preserved and is not broadened by this change.

## Write compatibility and known gap

Draft/create/update/publish/amend/call/start/complete/interrupt/retry/cancelProtection use existing normal `/queue/plans` routes and command services. Existing permissions, location access, idempotency, server availability, hours and entitlement admission remain unchanged.

Normal resource configuration creates **draft/untracked** pools and cannot accept `trackingEnabled`. Its only current enabling path is the separately guarded local activation service, which still requires a disposable fixture marker. This contract does not authorize enabling tracking or fabricating markers. QA must use an already-enabled permitted resource pool, or explicitly report that fresh tracked-resource setup is blocked pending a separate real activation contract.

## Verification boundary

Mounted actual `src/app.ts` tests exercise real authentication/MFA, route registration, authorization, scope, read-only projection and bounds against an in-memory mocked PostgreSQL transport; no existing API/database/fixtures are contacted. Client tests run actual React Query hooks with mocked fetch plus model/scope/SSE tests. These are not proof of actual PostgreSQL execution or full authenticated resource lifecycle. Independent source QA and Ikan-approved isolated activation must precede runtime Free/Pro acceptance.
