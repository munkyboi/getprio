# Queue, booking, and AI product cleanup

## Product direction

The product focuses on queue operations, ordinary service bookings, and AI assistance grounded in reliable queue and booking data. Booking campaigns are being retired. Customers do not receive ratings; reviews and star ratings apply only to vendors.

Wait-time model work is on hold. Existing sample capture may continue; no model rollout or additional infrastructure is part of this cleanup.

## Slice 1: Retire customer ratings

- Remove customer scores from account, booking, contributor, and public campaign responses and shared contracts.
- Remove customer rating displays, contributor/organizer rating controls, and the vendor action for rating an organizer.
- Return HTTP 410 from the authenticated legacy customer-rating write endpoints, including requests from older clients. Do not query bookings or campaigns or write ratings in those handlers.
- Remove customer-rating creation and aggregate computation from the repository.
- Preserve vendor reviews for served queue visits and completed bookings, customer review revisions, vendor replies, and moderation.
- Preserve historical records and existing dispute handling. No schema deletion or data purge is authorized by this slice.

Implementation is prepared on `codex/retire-customer-ratings`; it still needs PR/CI review, merge, deployment, and runtime evidence.

## Slice 2: Retire booking campaigns

The remaining campaign feature is not disabled by Slice 1.

Inventory and remove campaign creation and discovery, booking opt-in, share/join flows, contribution operations, customer navigation/dashboard cards, vendor campaign configuration and controls, notification preferences, and active campaign jobs. Keep ordinary bookings, payment-proof review, check-in, booking-to-ticket linkage, queue operations, and vendor reviews.

Before changing access to existing campaign records, settle the history policy with the product owner: preserve authenticated read-only history, or remove product access while retaining stored records. Inspect outstanding contributions, reimbursements, booking links, holds, and scheduled jobs before retiring their handlers. Existing financial obligations must have a deliberate resolution path rather than disappearing behind a retired endpoint.

Retain historical database migrations. Any later deletion of stored records or files requires a separate retention and cleanup scope.

## Slice 3: Reconcile product requirements

Update help, terms/privacy descriptions, API documentation, capstone requirements, and slice trackers to reflect the shipped campaign retirement. Check web and mobile consumers against the revised API contracts. Keep vendor reviews in scope.

Resume wait-time evaluation only when the product owner resumes that work and collected observations support evaluation on later tickets.
