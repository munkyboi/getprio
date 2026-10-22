# Organizer-collected campaign redesign

Label: wayfinder:map

## Destination

Produce a decision-ready redesign specification and implementation cutline for organizer-collected campaigns attached to paid, vendor-validated GetPrio bookings. The redesign moves campaign and contribution management from the vendor dashboard to customer controls and adds the role-scoped trust-rating system.

The map is complete when lifecycle, authority, customer UX, ratings, security, migration, and rollout choices are sharp enough to become implementation tickets without retaining the legacy vendor-managed funding model.

## Notes

Domain: GetPrio booking, manual-payment, campaign, customer-account, and trust flows. Consult `AGENTS.md` and `CONTEXT.md` on every resolving session.

Skills every resolving session should consult:

- `/grilling`
- `/domain-modeling`

Standing direction agreed during charting:

- A customer first books one service or Service Bundle, opts into a group-funded campaign, pays the normal booking payment, and receives vendor validation before campaign creation is available.
- The organizer's booking payment is separate from campaign collections. The vendor never receives, verifies, or settles contribution money.
- The organizer creates the campaign title, description, deadline, payment instructions, contributor-slot count, and fixed per-slot contribution fee; contributors submit proof and the organizer accepts or rejects it.
- A campaign's target is a fixed count of organizer-accepted contributor payments. The organizer's booking payment occupies no contributor slot and does not reduce the target.
- A missed deadline or target does not alter the paid, vendor-validated booking; it remains the organizer's responsibility.
- Campaigns default to share-link visibility and can opt into a privacy-minimized public listing for signed-in customers.
- Customers rate vendors publicly after completed service. Vendors rate organizers after service; organizers rate contributors after contribution review; contributors rate organizers after campaign closure. Individual-user ratings are private to authorized roles.
- Campaign controls are customer-account controls, never vendor-dashboard controls. Vendor users retain only normal booking validation and service operations.

## Decisions so far

- [Booking-to-organizer-campaign lifecycle](./issues/01-booking-to-organizer-campaign-lifecycle.md) — a paid, confirmed booking may create a non-blocking campaign that moves draft → collecting → collected or contributor-confirmed reimbursement → cancelled without changing the booking.
- [Organizer collection authority and safeguards](./issues/02-organizer-collection-authority-and-safeguards.md) — organizers alone review proofs; review-overdue, contributor-confirmed reimbursement, scoped evidence, auditable actions, preferred-channel notices, and Platform Admin freezes make collection accountable without platform custody.
- [Customer campaign controls and discovery](./issues/03-customer-campaign-controls-and-discovery.md) — a mobile-first customer Campaign Control Center, entered from confirmed bookings and Campaigns, uses a campaign-level generic share link, private organizer roster, and privacy-minimized share/public discovery.
- [Role-scoped trust rating system](./issues/04-role-scoped-trust-rating-system.md) — one five-star rating per qualifying interaction combines public vendor reviews with private reusable user-trust summaries, minimal aggregate display, structured low-rating context, revision, and appeals.
- [Legacy migration, RBAC, and rollout cutline](./issues/05-legacy-migration-rbac-and-rollout-cutline.md) — preserve setup data, reset all transaction data, replace the legacy campaign model through seven ordered slices, and retire every vendor campaign/proof/refund route under server-enforced customer ownership.
- [Philippine legal and compliance boundary](./issues/06-philippine-legal-compliance-boundary.md) — proceed only as a record-only organizer collection, with BSP/SEC scope safeguards, DPA evidence controls, DTI/consumer review, tax advice, and formal counsel sign-off as release gates.
- [Public campaign eligibility and abuse policy](./issues/07-public-campaign-eligibility-and-abuse-policy.md) — signed-in discovery requires organizer and vendor-publication opt-in, ranks by deadline, reveals only privacy-minimized profiles, and uses publication caps, rate limits, honeypots, moderation, reporting, and Platform Admin freeze/review.

## Not yet specified

<!-- The route is clear. Future questions belong to implementation slices. -->

## Out of scope

- GetPrio payment-gateway processing, escrow, payouts, or automatic reimbursement.
- Generic crowdfunding unrelated to one paid and vendor-validated GetPrio booking.
- Vendor dashboard controls for campaign collection or contributor proof review.
