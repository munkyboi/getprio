# Enforced Queue Day opening writer

Manual opening now uses the location-first authorized vendor Queue Day transaction. Current `tenant.queue.operate`, actor/membership, staff branch or counter access, active tenant/branch and enforced mode are checked with accepted grants held through commit. Lifecycle audit roles use the current membership.

Opening reads the current branch timezone and operating hours on the transaction client after the branch and previous open-day lock waits. Database wall-clock time determines the effective interval; caller-supplied timezone/time snapshots do not authorize opening. Existing operating-hours replacement locks the branch, preventing a schedule change during opening. A newly opened day must still be within its interval after its row has been locked.

Prior-day overdue reconciliation, new-day opening, carry-over ticket/segment activation, lifecycle events, notification intents and one branch revision commit together. Rejected actions or post-write failures roll back all effects. Duplicate opening remains idempotent without another activation or revision; a closed current day still requires reopening. Eligible carry-over rows use current database time and are checked again after ticket-lock waits, preventing activation after their expiry. Expired pending tickets stay pending for the separate expiry writer.

Actual occupancy, explicit service timing and terminal linked booking statuses remain intact. Opening does not start a service, release an allocation or convert a reservation. This slice preserves existing carry-over activation policy and does not certify activation protection reconciliation.

PostgreSQL coverage extends the shared real Queue Day/event/outbox/ledger fixture: current grants/activity/mode and held staff access, tenant-first grant revocation with branch-FK writes, competing opens, stale versions and closed-day rejection, current timezone/hours after contention, effective-hours and carry-over expiry after lock waits, prior-day closure and carry-over rollback, vendor dispatch authorization, and occupancy/timing retention.

Validation: isolated loopback PostgreSQL full backend suite passed 1,068 tests with seven opt-in skips (1,075 total), zero failures. Focused source ESLint, backend typecheck and diff checks passed. Coverage: 67.98 percent lines/statements, 69.24 percent branches and 63.52 percent functions; no 80 percent threshold claim.

Standalone system reconciliation revisions, carry-over activation protection reconciliation, terminal unused-protection cleanup, account deletion, catalog/settings revision writers and full activation reconciliation remain inventory gaps. Tracking and writer coverage stay constrained to false; the producer stays `not_ready`. No migration, UI, customer estimate, capture/export or inference change. Authenticated live vendor resource execution remains a separate acceptance gate.
