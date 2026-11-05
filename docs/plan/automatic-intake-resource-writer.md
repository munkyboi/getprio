# Automatic legacy intake resource writer

Automatic pause/resume for legacy/shadow queues now reads current branch activity/mode and current tenant activity/automation policy inside the existing location-first transaction. The accepted tenant row remains share-locked through commit. Disabled or invalid policy, inactive scope, enforced mode and closed intake return without mutation. Persistence identities must fit the existing repositories' safe numeric range. Supplied tenant settings cannot authorize a transition or suppress a currently enabled policy.

Threshold and vacancy calculations use the current database settings (threshold 1 through 500; resume vacancy 5 through 50 percent). Automatic resume only changes an active `auto_threshold` pause; manual pauses remain manual. Waiting count and closure predicates are reread after lock waits. The existing pause repository handles the actual state transition.

Every successful automatic transition commits its pause row, a scoped `queue_paused` or `queue_resumed` event with system source/current policy metadata, and one ledger revision advance on the same client. Concurrent repeats produce one transition and do not advance revision again. No-op calls create neither an event nor a scope. Event failure rolls the state, event and revision back together. Existing allocations are retained; intake transitions do not pause dispatch or release occupancy.

With an owned transaction (including the configured owner pool), push notifications follow successful commit. A supplied caller-owned transaction joins the current client and suppresses immediate push; the caller must arrange any notification after its own commit. Current production call sites use owned transactions. This does not certify arbitrary prelocked clients, all catalog/settings writers, or full writer coverage.

Enforced/system closure, terminal protection cleanup, carry-over expiry, deletion and catalog/configuration revision/reconciliation remain separate inventory gaps. Tracking/coverage gates stay disabled and the producer stays `not_ready`; capture/export/inference and customer estimates are unchanged.

The release-blocking persistent-cookie test now fixes its clock for an exact TTL assertion. This changes only its test fixture; production session expiry still uses elapsed wall time.

Validation uses actual PostgreSQL pause/ticket/ledger SQL and policy locks with bounded transactional closure/event/notification fixtures. Tests cover concurrent repeats, no-op scopes, current disabled/threshold/vacancy/activity changes after location waits, share-lock lifetime, event failure, caller rollback without push and retained actual occupancy. Full production schema or authenticated live automatic queue behavior is not claimed.

Final disposable PostgreSQL backend suite: 981 passed, seven opt-in skips (988 total); focused suite 119 passed. Focused ESLint, backend typecheck and diff checks passed. Coverage: 65.93 percent lines/statements, 69.11 percent branches, 61.4 percent functions; no 80 percent threshold claim.
