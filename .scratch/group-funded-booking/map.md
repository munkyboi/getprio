## Destination

Produce a decision-ready product and architecture map for adding a group-funded booking option to GetPrio, where multiple participants fund a single service booking and the booking advances only after the funding target or minimum participant threshold is met.

The map is complete when the remaining work can move into a concrete spec and implementation tickets without unresolved product, data-model, operations, or security questions.

## Notes

Domain: GetPrio booking and payment flows, with capstone-aligned HCI, RBAC, privacy, and security requirements from `AGENTS.md`.

Relevant local context:
- `AGENTS.md`
- `docs/plan/capstone-marketplace-booking-prd.md`
- `docs/plan/capstone-ias-security-privacy-prd.md`
- `docs/plan/payments-billing-v1-stability-prd.md`
- `docs/plan/booking-queue-mvp-execution-checklist.md`
- Existing booking/payment code in `backend/src/services/bookingService.js`, `backend/src/repositories/bookings.js`, and customer/vendor booking detail flows.

Skills every resolving session should consult:
- `/grilling`
- `/domain-modeling`

Standing preferences:
- Plan, do not implement.
- Keep role-aware behavior explicit for Customer, Vendor Admin, Vendor Staff, and Platform Admin.
- Preserve server-enforced authorization and capstone IAS/HCI traceability.
- Treat participant funding, refunds, and visibility as first-class security/privacy concerns, not just UI states.
- Design this as a category-agnostic GetPrio capability. Do not couple the domain model or lifecycle to pickleball, sports, or any single service vertical unless a later ticket explicitly decides on eligibility constraints.

## Decisions so far

- [Group-funded booking lifecycle and core rules](./issues/01-group-funded-booking-lifecycle-and-core-rules.md) — v1 uses a non-capacity-holding funding stage with paid-on-join contributors, full-target unlock, vendor review after funding, and refund triggers for organizer pre-funding cancel, deadline failure, and vendor rejection.
- [Group-funded booking data model and ledger boundaries](./issues/02-group-funded-booking-data-model-and-ledger-boundaries.md) — model funding as separate campaign, participant, contribution, refund, and event records until vendor approval links it to a normal paid booking; service/location-service eligibility stays category-agnostic and is snapshotted onto each campaign.
- [Group-funded booking customer and participant experience](./issues/03-customer-and-participant-experience-for-group-funded-booking.md) — vendor profiles use `Booking options` tabs for `Standard` and public `Group-funded` campaigns; organizers start from eligible service cards or the group-funded tab into booking mode, choose private-link or public visibility, can add a moderated 280-character description, contributors must log in to pay an exact fixed share, and cancellation uses anti-dark confirmations.
- [Group-funded booking vendor operations and capacity rules](./issues/04-vendor-operations-and-capacity-rules-for-group-funded-booking.md) — no funding-stage capacity hold; full funding creates a 24-hour group-funded capacity hold for vendor review, with organizer-approved replacement slots, organizer-owned linked bookings, one check-in ticket, and contribution-ledger refund rules.
- [Group-funded booking security, privacy, and abuse controls](./issues/05-security-privacy-and-abuse-controls-for-group-funded-booking.md) — public payloads stay privacy-minimized; contribution actions require customer auth; proof/refund evidence is private and role-scoped; funding/refund integrity is ledger-driven; descriptions use inline moderation plus reporting; sensitive transitions require audit/events and OWASP-focused tests.
- [Vendor group-funded eligibility and settings](./issues/07-vendor-group-funded-eligibility-and-settings.md) — `location_services` is the authoritative eligibility layer; vendors configure contributor-count bounds, contribution guardrails, deadline bounds, and public-campaign allowance; private-link campaigns remain available when enabled; v1 excludes deadline extensions, participant swaps, overfunding, and single-payer fallback conversion, so missed targets follow the standard funding-failure refund path.
- [Spec cutline and implementation slice plan](./issues/06-spec-cutline-and-implementation-slice-plan-for-group-funded-booking.md) — implementation starts with schema/domain foundation, then private backend lifecycle, vendor review, customer private campaign UX, public discovery/moderation, and final security/test/IAS documentation gates.
- [Schema and domain foundation](./issues/08-schema-and-domain-foundation-for-group-funded-booking.md) — implemented schema/repository-only slice: extended `location_services`, added campaign/participant/contribution/refund/event/capacity-hold tables, added nullable normal-booking campaign link/source fields, and proved contribution payment evidence stays outside `bookings.payment_*`.
- [Service bundles for multi-court group-funded bookings](./issues/19-service-bundles-for-multi-court-group-funded-bookings.md) — newly clarified: model cases like 8 people renting VIP Court and Court 1 simultaneously as one group-funded Service Bundle with multiple selected branch services, one contributor pool, per-service capacity checks/holds, and one organizer-owned confirmed booking after vendor approval.
- [Customer Service Bundle creation UX](./issues/20-customer-service-bundle-creation-ux.md) — implemented: the group-funded booking flow keeps the selected service as the primary schedule anchor, lets organizers add same-branch group-funded-enabled services, shows the bundle total/equal contribution, and submits `bundleItems` to the existing campaign creation endpoint.
- [Bundle-first slot and service eligibility flow](./issues/21-bundle-first-slot-and-service-eligibility-flow.md) — planned: replace the primary-service customer flow with branch-slot-first selection, availability-aware service eligibility, and server-side full-bundle validation.
- [Submitted-proof contributor reservation rule](./issues/16-submitted-proof-contributor-reservation-rule.md) — a submitted proof temporarily reserves one contributor position until vendor rejection or the funding deadline; only verification counts toward funding and creates the locked/green position.
- [Contributor reservation admission and presentation](./issues/17-contributor-reservation-admission-and-presentation.md) — verified plus submitted-proof reservations atomically cap contributor admission; the privacy-safe meter presents green verified, blue pending-verification, and gray vacant positions.

## Implementation tickets

- [08 — Schema and domain foundation](./issues/08-schema-and-domain-foundation-for-group-funded-booking.md) — implemented.
- [09 — Backend campaign lifecycle and ledger APIs](./issues/09-backend-campaign-lifecycle-and-ledger-apis-for-group-funded-booking.md) — implemented.
- [10 — Vendor operations and review flow](./issues/10-vendor-operations-and-review-flow-for-group-funded-booking.md) — implemented.
- [11 — Customer organizer and contributor experience](./issues/11-customer-organizer-and-contributor-experience-for-group-funded-booking.md) — implemented.
- [12 — Public discovery and moderation surface](./issues/12-public-discovery-and-moderation-for-group-funded-booking.md) — implemented.
- [13 — Security, tests, smoke, and capstone documentation](./issues/13-security-tests-smoke-and-capstone-docs-for-group-funded-booking.md) — implemented.
- [14 — Live campaign updates over tenant/location stream](./issues/14-live-campaign-updates-over-tenant-location-stream.md) — implemented.
- [15 — Rejected excess contribution refunds](./issues/15-rejected-excess-contribution-refunds.md) — implemented.
- [17 — Contributor reservation admission and presentation](./issues/17-contributor-reservation-admission-and-presentation.md) — resolved: verified and submitted-proof reservations cap admission atomically, with privacy-safe aggregate meter states.
- [18 — Implement contributor reservations and segmented progress meter](./issues/18-implement-contributor-reservations-and-segmented-progress-meter.md) — implemented: submitted-proof reservations atomically cap admission, safe aggregate counts power the segmented meter, and contributor-facing responses no longer expose organizer identifiers.
- [19 — Service bundles for multi-court group-funded bookings](./issues/19-service-bundles-for-multi-court-group-funded-bookings.md) — implemented: added bundle item persistence, safe campaign DTO exposure, multi-item capacity checks, per-item vendor review holds, replacement-slot shifting, and regression coverage for VIP Court + Court 1 style campaigns.
- [20 — Customer Service Bundle creation UX](./issues/20-customer-service-bundle-creation-ux.md) — implemented: group-funded campaign creation can send one or more selected branch services as `bundleItems` while preserving the single-service default path.
- [21 — Bundle-first slot and service eligibility flow](./issues/21-bundle-first-slot-and-service-eligibility-flow.md) — implemented: branch-hours candidate slots precede bundle selection, with per-service availability, booking capacity, and active-hold eligibility checks.

## Out of scope

- Building the production implementation in this wayfinding effort.
- Expanding into generic crowdfunding beyond a single service booking.
- Designing gateway-specific payout settlement beyond what is needed to make the booking workflow and refund model decision-ready.
