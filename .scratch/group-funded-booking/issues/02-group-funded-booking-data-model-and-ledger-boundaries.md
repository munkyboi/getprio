Type: grilling
Status: resolved
Blocked by: 01

## Question

What booking, participant, contribution, funding-target, deadline, approval, and refund data must be modeled separately from the current single-payer booking records, and what should remain in the existing booking/payment structures?

## Working notes

- Rule agreed: the funding-stage object should be stored separately from normal `bookings`. A group-funded booking links to a normal booking only after it advances, so unfunded campaigns do not consume capacity or inherit single-payer booking assumptions.
- Rule agreed: participant identity and contribution/payment records should be modeled separately. Participant records represent who joined and their role; contribution records represent money movement, payment attempts, refund state, and audit-relevant payment metadata.
- Rule agreed: store `organizer_user_id` on the group-funded booking for campaign authority, and also represent the organizer as a participant if they contribute money. Organizer authority and paid participation remain separate concepts.
- Rule agreed: snapshot funding terms at creation, including target amount, required contribution, max participants, currency, selected service, selected location, and schedule details. Later service or price edits do not rewrite an active group-funded booking's funding terms.
- Rule agreed: the group-funded booking has its own campaign status separate from `bookings.status`. Campaign status describes the funding effort; the normal booking status describes the service booking only after a linked booking exists.
- Rule agreed: cache aggregate funding fields on the group-funded booking, such as funded amount, paid participant count, and funded timestamp, while treating contribution records as the source of truth. Aggregate fields must be updated transactionally from accepted contributions.
- Rule agreed: model refunds as separate refund records linked to contributions, with cached refund status on the contribution for quick filtering. In v1, refunds are performed manually by the vendor side, so refund records track obligations, vendor action, notes, evidence, and completion state rather than automatic gateway settlement.
- Rule agreed: store manual payment evidence on each contribution, including reference, proof file metadata, submitted/verified/rejected timestamps, reviewer, and rejection reason. The existing single booking payment proof fields are not sufficient for multiple contributors.
- Rule agreed: funding totals count only vendor-verified paid contributions. Submitted but unverified or rejected payment evidence does not advance the campaign toward the target.
- Rule agreed: when a group-funded campaign links to a normal booking, the linked booking should be marked `payment_status = 'paid'` with a source marker or campaign link. Payment evidence remains in the contribution ledger rather than being copied into the single booking payment proof fields.
- Rule agreed: add a dedicated group-funded booking event timeline for domain events, while still emitting platform audit logs for sensitive or admin actions. The timeline supports customer/vendor history without overloading the security audit log.
- Rule agreed: group-funded eligibility should be configured on services or location-services, then snapshotted onto each group-funded campaign. The capability remains category-agnostic instead of being tied to sports or any single vertical.

## Answer

The v1 data model should keep group-funded booking as a separate funding domain until it becomes a normal booking:

1. `group_funded_bookings` is the parent funding-stage record. It stores tenant, location, service, organizer, selected schedule, funding deadline, campaign status, linked booking id when one exists, and snapshotted funding terms.
2. The parent record stores immutable creation-time terms: `target_amount_cents`, `required_contribution_cents`, `max_participants`, currency, service/location/schedule details, and any eligibility/config snapshot needed to explain why the campaign was allowed.
3. The parent record stores cached aggregate fields such as `funded_amount_cents`, `paid_participant_count`, and `funded_at`, but the contribution ledger remains the source of truth.
4. `group_funded_booking_participants` stores participant identity and role. The organizer is stored on the parent for ownership checks and also appears as a participant when they contribute money.
5. `group_funded_booking_contributions` stores each participant's payment obligation and manual payment evidence. It includes amount, contribution status, payment reference, proof file metadata, submitted/verified/rejected timestamps, reviewer, and rejection reason.
6. Funding totals count only vendor-verified paid contributions. Submitted, failed, or rejected contribution evidence does not move the campaign toward the target.
7. `group_funded_booking_refunds` stores refund obligations and vendor-side manual refund actions linked to contributions. Contribution rows may cache `refund_status` for quick filtering, but refund history lives in the refund records.
8. Refunds are manual on the vendor side in v1. The model tracks obligation, vendor action, notes, evidence, and completion state rather than automatic gateway settlement.
9. `group_funded_booking_events` stores the domain timeline: created, contribution submitted, contribution verified, funding completed, vendor approved, vendor rejected, expired, refund requested, refund completed, and similar lifecycle events.
10. The linked normal `bookings` row is created or connected only after funding and vendor approval. It should be marked `payment_status = 'paid'` with a campaign link/source marker, while payment evidence remains on contribution records.
11. Group-funded eligibility belongs on service or location-service configuration and is snapshotted onto the campaign. This keeps the feature reusable across sports, salons, rentals, classes, scheduled product pickup, and other eligible GetPrio service types.
