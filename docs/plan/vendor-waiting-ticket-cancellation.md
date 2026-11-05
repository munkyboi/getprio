# Vendor waiting-ticket cancellation

Vendor queue operators can cancel a ticket while it is waiting at the selected location. The current queue row provides a Cancel ticket action with a confirmation dialog. This action must also be retained in the vendor dashboard migration.

Manage waiting tickets provides a complete paginated list across all waiting tickets at the selected location, including activated carry-over tickets and tickets outside the ten-row snapshot preview. `GET /api/vendor/tenant/:tenantSlug/queue/waiting-tickets?location=:locationSlug&page=:page` uses the same state-update permission and location access checks, returns 25 tickets per page plus a next-page indicator, and excludes contact details and lookup codes. Pending, unactivated carry-over tickets are not waiting tickets and are excluded.

## Server contract

`POST /api/vendor/tenant/:tenantSlug/queue/tickets/:ticketId/cancel?location=:locationSlug`

- Requires authenticated tenant access, `tenant.ticket.update_state`, and the existing queue location access check. Enforced queue locations require staff location assignment.
- Accepts a positive safe integer ticket ID. Ticket lookup and row locking include both the authorized tenant and selected location.
- Returns 404 when the ticket is outside that scope or absent; returns 409 when its locked status is no longer waiting.
- The update, cancellation event, and censored prediction outcome share a transaction. Called outcomes are never overwritten.
- Open ticket journey segments close in that same transaction with the cancellation timestamp, outcome, and reason. Post-cancellation automation and snapshots use the ticket's queue date.
- Records `vendor_cancelled` as the waiting-ticket status reason and event reason. Customer cancellation and carry-over decline keep their existing reasons.
- Publishes the updated queue snapshot and uses existing queue auto-resume, upcoming-ticket notification, and customer push behavior.

Cancellation removes the queue ticket. It does not cancel a linked booking, change payments, issue a refund, or release resource occupancy. The confirmation explains the booking boundary. A cancelled ticket cannot be restored using missed-ticket recovery; a returning customer needs a new ticket.

Confirmation dialogs disable dismissal by button, Escape, and overlay while a request is pending. The waiting-ticket manager also prevents dismissal during cancellation and refreshes its list after the operation settles.

## Deployment acceptance

1. Issue a waiting ticket with a service selected, and let a baseline/shadow observation be captured.
2. Confirm the read-only vendor audit shows a pending shadow observation before cancelling.
3. Cancel the ticket from its waiting row and verify it disappears from the current queue.
4. Confirm the audit reports a censored shadow observation. No successful candidate is expected from an artifact with insufficient training history.
5. Verify an already-called ticket is rejected by the staff cancellation endpoint and keeps its called outcome.

This feature does not change customer estimates or enable model rollout. Local authoring uses syntax, lint, type, and diff checks; live cancellation acceptance follows deployment.
