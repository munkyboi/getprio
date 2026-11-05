# Selected commercial entitlement held-read prerequisite

Implemented internal selected reader against deployed main `98281ba7c87a93e4d30139643c7ceff26d95a40d` after #443. It is not connected to a route or invitation adapter and does not certify complete commercial writers. The source inventory below remains an audit lead list.

## Boundary

Ordinary `getTenantEntitlements(..., { client })` must remain nonlocking. Optional client presence is not authority or evidence of held policy: Platform capacity/usage GETs depend on REPEATABLE READ READ ONLY transactions. `readHeldTenantEntitlements` is explicit and internal, requires a caller-owned write transaction and exact tenant identity, and preserves ordinary entitlement overlay/status/retired-field semantics for its supported selected read. It neither begins nor commits transactions and does not authorize callers.

The invitation caller must acquire branch roots before the tenant root and actor/target/membership authority. The held commercial reader must not acquire branch roots late. Reacquiring a tenant root already held by that caller is compatible; merely documenting an order is not evidence that unrelated callers hold it.

## Selected source inventory

| Publisher | Inspected source seam | Remaining proof |
| --- | --- | --- |
| Provider activation | billing repository update/insert, billing service paid activation | Tenant root plus current subscription locks, callback/continuation client, provider origin remains independent |
| Subscription create/update | billing repository createTenantSubscription/updateTenantSubscription | Direct/indirect callers, tenant movement and FK insertion; preserve exact identities, existing overlays |
| Scheduled transition | subscriptionLifecycle expire-and-create | Tenant root, existing rows and inserted replacement; race actual execution rather than helper mocks |
| Free assignment/renewal | subscriptionLifecycleService and repository renewal | Existing selected root proofs; absence and exact row/client behavior for held readers |
| Suspension | subscriptionLifecycleService suspension | Current row update and both admission orders |
| Catalog publish | subscriptionPlans repository updatePlan, Platform confirmation route | Plan row update, feature/allowance child writes and preview lock order; use NOWAIT for known inverse contention |
| Rollout script | scripts/entitlement-rollout.mjs conversion and Free insertion | Operator script is a separate publisher; its root/client and rerun behavior cannot be assumed from runtime proofs |
| Historical migrations | subscription/plan policy migrations | Static schema provenance and reviewed execution boundary; no runtime certification |

This lead inventory is not exhaustive. Enumerate ON CONFLICT, aliases, webhook/sync paths, scripts and entitlement override/feature/allowance writers before extending its claim.

## Selected reader and remaining publisher proof

- Hold the exact tenant root through commit. Current subscription rows should be acquired in deterministic numeric identity order with SHARE NOWAIT, with an explicit row bound. Known contention must produce a bounded retryable result; never catch a lock error and continue an aborted transaction.
- Reuse the existing subscription selection: exactly one active history row is unambiguous; no active selected row returns the ordinary empty entitlements. Multiple active rows fail `SUBSCRIPTION_AMBIGUOUS`. Read the selected plan on the same client and hold its row with SHARE NOWAIT. A missing active plan fails `ENTITLEMENT_PLAN_UNAVAILABLE`, rather than certifying incomplete policy; ordinary nonlocking reads retain their historical fallback.
- Hold existing rows against updates, expiry and tenant movement. Prove new-row absence protection using the actual tenant FK and FOR UPDATE root: subscription insertion or movement into the scope must wait. A SELECT of no rows alone does not protect absence.
- Preserve ordinary active-status interpretation and catalog-plus-subscription overlay; a held read does not approve a new current-period rule or entitlement migration.
- Test publisher-first and reader-first plan/subscription changes, empty scope insertion, target tenant movement, legacy child-first tenant-FK inversion, rollback and same-client/no-default-pool behavior. Include exact adjacent BIGINTs, bounded scans, missing plan and ambiguous history.
- Preserve READ ONLY capacity/usage callers with optional client and no explicit held-policy request. Do not add locks to their shared repository defaults.

## Selected acceptance evidence

Disposable loopback PostgreSQL tests execute the actual helper and real repositories. They prove reader-first plan/subscription updates and tenant movement wait until commit, publisher-first row contention produces a retryable 409 requiring rollback, and a legacy child-first update plus tenant-FK insertion can proceed after the reader rolls back without a reverse wait. Empty-scope insertion waits on the actual FK/root. Tests cover exact adjacent BIGINT tenants, ambiguity/missing plan, the 1,000-row history bound, composed policy, rollback and ordinary REPEATABLE READ READ ONLY compatibility. These are row/FK facts, not provider, complete route or whole publisher certification. No live commercial mutation was performed.

Known contention maps to `ENTITLEMENT_SUBSCRIPTION_BUSY` or `ENTITLEMENT_PLAN_BUSY`; the caller must roll back before retrying. Unknown database errors propagate. The helper deliberately does not recover an aborted transaction or change idempotency/HTTP behavior because no runtime route consumes it yet. Same-client reads rely on #443 client propagation.

Commercial row holds are only one invitation prerequisite. Current actor/target eligibility, membership absence/seat/owner serialization, resource effects and atomic notice intents require the separate invitation graph. Provider provenance, session/realm/MFA, deletion, complete source writer inventory, snapshots, capture and rollout retain their own gates.
