# Queue, booking, and AI product direction

GetPrio focuses on queue operations, ordinary service bookings, and AI assistance grounded in reliable queue and booking data. Customers do not receive ratings; reviews and star ratings apply only to vendors.

## Current cleanup

Booking campaigns are removed directly. There is no archive, history UI, migration wizard, or transition phase.

- Remove campaign creation, discovery, public share/join pages, contribution and reimbursement APIs, moderation actions, lifecycle jobs, and booking opt-in.
- Remove campaign navigation, dashboard cards, vendor configuration controls, notification settings, Help articles, and active Terms descriptions.
- Prevent saved plan settings and entitlement overrides from restoring campaign access.
- Preserve ordinary booking, payment-proof review, check-in, booking-to-ticket linkage, queue operations, and vendor reviews.
- Remove customer rating controls, customer-score API fields and aggregate queries, and customer-rating creation.
- Retain historical database migrations and stored records. No data/schema purge is part of this product removal.

Implementation is prepared in PR #286. CI, review, merge, deployment, and live runtime evidence are separate gates.

## Next product work

Reconcile the booking execution checklist against current code, then complete outstanding customer booking/ticket flow and vendor operations work. AI integration should support these workflows.

Wait-time model work remains on hold. Existing sample capture may continue; model rollout and new inference infrastructure are outside this cleanup.
