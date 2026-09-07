Type: grilling
Status: resolved
Blocked by:

## Question

What is the canonical lifecycle and rule set for a group-funded booking in GetPrio, including creation, participant join/pay flow, funding progress, vendor review point, confirmation, expiry, cancellation, and refund-triggering terminal states?

## Working notes

- Rule agreed: the group-funded booking capability is category-agnostic and must not be modeled as a pickleball-only, sports-only, or otherwise single-vertical workflow.
- Rule agreed: a group-funded booking does not consume booking capacity before it is fully funded. Before target completion, it behaves as a pre-booking funding campaign rather than as a real capacity-holding booking. Once fully funded, the booking can be created or activated and then proceed to vendor review.
- Rule agreed: reaching the funding target does not auto-confirm the booking. It moves the booking into a separate funded state that is ready for vendor review, and only vendor approval can move it to confirmed.
- Rule agreed: one customer acts as the organizer. The organizer starts the group-funded booking, owns the booking details, and holds the main management and vendor-facing controls. Other participants join as contributors rather than as equal controllers.
- Rule agreed: contributors join by paying their required share immediately. A participant only counts as joined once payment is successfully recorded.
- Rule agreed: the full funding target is the only advancement gate in v1. Minimum participant count is not a separate unlock rule for moving the booking forward.
- Rule agreed: if the funding deadline passes before the full target is reached, the group-funded booking immediately ends in a canceled outcome with a clear funding-failure reason, and all recorded contributions become refund-eligible.
- Rule agreed: if the booking is fully funded but the vendor rejects it during review, the booking ends in a vendor-canceled outcome and all contributor payments become fully refundable.
- Rule agreed: the organizer may cancel the group-funded booking only before the funding target is reached. After full funding, the organizer cannot unilaterally unwind it.
- Rule agreed: individual contributors cannot withdraw their paid share in v1. Contributions stay committed until a system-defined refund trigger occurs.
- Rule agreed: once the vendor approves and the booking becomes confirmed, it follows the normal GetPrio booking lifecycle and cancellation policy rather than a separate long-lived group-funded policy.

## Answer

Canonical v1 lifecycle for a group-funded booking:

0. The capability is generic to GetPrio and may be used by any eligible service category; it is not specific to sports bookings.
1. An organizer starts a group-funded booking for a service, schedule, funding deadline, and fixed per-person contribution.
2. The booking enters a funding stage and does not yet consume booking capacity.
3. Contributors join only by successfully paying their required share; unpaid intent does not count as joined.
4. The booking remains in funding until the full funding target is reached. Minimum participant count is not a separate advancement rule in v1.
5. Before the target is reached, the organizer may cancel the booking. If canceled, all recorded contributions become refundable.
6. Individual contributors cannot withdraw their share once paid.
7. If the deadline passes before full funding, the booking ends as canceled due to funding failure and all recorded contributions become refundable.
8. If the full funding target is reached, the booking moves to a funded state that is ready for vendor review; it is not auto-confirmed.
9. The vendor may approve or reject the funded booking.
10. If the vendor rejects it, the booking ends in a vendor-canceled outcome and all contributor payments become fully refundable.
11. If the vendor approves it, the booking becomes a normal confirmed GetPrio booking and then follows the standard downstream booking, check-in, queue, and cancellation rules.
