# Vendor availability creation writer

Weekly-rule and date-exception POST routes pass the authenticated actor and server-resolved tenant/branch to a creation service. It enters the shared location-first transaction, rechecks current `tenant.availability.manage` access and holds accepted tenant/user/membership grants through commit. Assigned staff, revoked membership, deleted/suspended users and foreign branches are denied. Inactive tenant/branch administration remains supported.

Existing payload normalization is shared with editing handlers. Creation validates weekly windows against the current branch hours after the branch lock. Selected tenant services are reread on the transaction client and held with a shared row lock until commit. Empty service selection still means all services; inactive catalog services retain their existing administration behavior. Overnight rules, date exceptions, capacities, public-text moderation and defaults keep their existing interpretation. Request actor/tenant/location IDs never become write authority.

The new availability entry and one branch ledger revision commit together. Competing creates serialize and each successful insert advances once; there is no new duplicate-rule or request-idempotency policy. Validation, authorization or post-insert failures leave neither an entry nor a scope revision. Both responses retain 201 with the existing metadata shape.

Disposable PostgreSQL tests use actual availability, hours and service repositories plus the real ledger migration with minimal application tables. They cover current grants and hours/services after contention, held branch/service/access locks, rollback, shared/overnight rules, date defaults, scoped revisions, competing inserts and preservation of existing booking protection, allocations and explicit service timing. HTTP/handler tests cover staff denial, authenticated actor forwarding and response contracts. Authenticated live vendor form execution remains unverified.

Editing existing availability, catalog/settings/default-hours writers, protection cleanup and activation reconciliation remain uncovered. Resource tracking and writer coverage remain disabled; the operational producer stays `not_ready`. No migration, dashboard/mobile UI, customer estimate, inference or capture/export behavior changes.

Local validation: full isolated PostgreSQL backend coverage passed 1,115 tests with seven opt-in skips (1,122 total), zero failures. The focused scoped PostgreSQL suite passed 137 tests. Changed-source ESLint, backend typecheck and diff checks passed.
