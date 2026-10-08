# Manual payment proof and resource reservations

Customer proof submission and vendor verification/rejection use the same location-first transaction as booking creation, cancellation and rescheduling. The booking is read again under a row lock after actor authorization; customer ownership and vendor membership/booking-management permission are checked against the persisted scope. Deleted or suspended actors cannot commit these mutations.

Submission rechecks manual-payment eligibility, arrival, duplicate proof and pending expiry under the lock. Upload metadata is validated before the transaction; object-key ownership is validated against the locked booking. Storage uploads remain provisional external operations, and final submission must still pass these checks. No storage network request runs inside the transaction.

Submission and verification preserve the immutable protected reservation, including after draft configuration edits or tracking disable. Missing, converted or inconsistent protection fails closed. Verification marks payment paid without confirming the booking. Rejection accepts only pending payment evidence, cancels the booking and its immutable protected reservations atomically, and never releases service occupancy. Verification and rejection serialize so a verified payment cannot subsequently be rejected through this endpoint.

Payment fields, reservation commands/receipts and scope revision commit or roll back together. Notifications and snapshot publication occur after commit. This is transaction atomicity, not whole-request HTTP idempotency or durable notification delivery.

Production tracking and writer coverage remain disabled. Bulk expiry, no-show, check-in, service sessions, other payment writers and configuration/reconciliation still require coverage before activation. The upload/view helpers retain their existing lazy-expiry path, so this slice does not establish complete expiry coverage. No activation, backfill, authoritative ready inventory, inference hook or customer estimate change is included.

Disposable PostgreSQL tests cover duplicate submissions, expired pending bookings, locked ownership/arrival checks, suspension, verify/reject contention, disabled tracking, immutable demand, reservation failure rollback, revoked vendor access, missing/converted protection and ordinary bookings. They exercise the actual ledger adapter/migration with minimal transactional booking fixtures. Object storage delivery and live authenticated resource execution are not established by these tests.
