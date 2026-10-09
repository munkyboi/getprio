# Database-clock Queue Day deadline guards

Caller-owned enforced intake checks, vendor pause/resume and vendor call/confirmation reconciliation now compare the locked Queue Day deadline with PostgreSQL `clock_timestamp()`. The timestamp is read after the Queue Day row lock, so transaction-start time, application clock skew and caller-supplied `now` cannot admit an overdue request or prematurely close a current day. Safe Queue Day identity checks also apply to the caller-owned intake path.

Existing transaction ownership, current vendor authorization, scope/activity/mode checks and revision behavior remain with the established writer boundaries. Ordinary caller-owned intake rejection rolls back without committing closure. Vendor operational reconciliation retains its existing commit-before-conflict and one-revision behavior. Paused/unopened responses, actual occupancy and explicit service timing are preserved. This slice does not independently certify all caller-owned boundaries or change inactive maintenance policy.

Real PostgreSQL tests cover caller timestamps, application clocks set far ahead and behind database time, expiry after a Queue Day wait, vendor intake and vendor call/confirmation behavior. Existing rollback, authorization, scope, occupancy and revision tests remain in the full suite.

Protection cleanup, carry-over protection reconciliation, diagnostics/warning ordering, account deletion, catalog/settings revision writers and complete writer/activation reconciliation remain separate inventory gaps. Tracking/coverage remain false; producer remains `not_ready`. No migrations, UI, customer estimate, inference, capture/export or activation changes. Authenticated live vendor resource execution remains a separate acceptance gate.

Validation: full isolated PostgreSQL backend coverage passed 1,092 tests, seven opt-in skips (1,099 total), zero failures. Source ESLint, backend typecheck and diff checks passed. Coverage: 68.34 percent lines/statements, 69.51 percent branches, 63.93 percent functions; no 80 percent threshold claim.
