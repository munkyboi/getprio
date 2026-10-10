# Vendor operating-hours writer

The vendor hours PATCH route passes its authenticated actor and resolved tenant/branch to a location-first scoped transaction. The transaction rechecks current user deletion/suspension state, active membership and `tenant.location.manage`, then holds accepted grants through commit. Assigned staff remain unable to administer hours. Administration still permits inactive tenants/branches; there is no new activation or billing policy.

Calendar validation and replacement retain existing behavior, including overnight intervals, overlap rejection and the route's empty-array fallback. The full calendar and one branch ledger revision commit together. Competing saves serialize; validation, insertion or later transaction failures roll back the calendar and scope changes together. No reservation or allocation command is issued, and actual service timing/occupancy is preserved.

The repository uses `FOR NO KEY UPDATE` for the branch during replacement. This still serializes hours/operational writers but permits a branch foreign-key key-share check by tenant-first grant changes. The admin adapter takes the branch before tenant/user/membership grants and does not upgrade that branch lock when replacing hours.

Disposable PostgreSQL tests execute the actual repository and ledger migration. They cover scoped revision changes, inactive administration with active occupancy, revoked/deleted/suspended/staff denial, current grant checks after branch contention, grants held through a failed replacement, rollback, competing whole-calendar saves, validation failure and tenant-first grant changes with a branch foreign-key insert. Existing repository and paid-intake contention tests retain their calendar/rollback coverage. Authenticated live vendor form execution remains a separate acceptance gate.

Location creation/default-hour setup, catalog/availability/settings edits, other internal hours callers and protection/activation reconciliation remain inventory gaps. Tracking and writer coverage remain constrained to false; the operational producer stays `not_ready`. Customer estimates, queue/service actions, mobile code and inference/capture/export contracts are unchanged.

Local validation: full isolated PostgreSQL backend coverage suite passed 1,101 tests with seven opt-in skips (1,108 total), zero failures. Changed source ESLint, backend typecheck and diff checks passed. Aggregate coverage is 68.37 percent lines/statements, 69.65 percent branches and 63.94 percent functions; this is not an 80 percent coverage claim.
