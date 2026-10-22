Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

How should vendor-side operations treat a group-funded booking with respect to slot availability, provisional holds, approval timing, participant visibility, booking management, cancellations, reschedules, and downstream queue/check-in behavior?

## Working notes

- Rule agreed: a group-funded booking does not hold capacity during the funding stage.
- Rule agreed: once a campaign reaches full verified funding, GetPrio should re-check slot availability and create a short-lived group-funded capacity hold while the vendor reviews it.
- Rule agreed: the post-funding hold should be a dedicated group-funded capacity hold, not a normal `bookings` row. The normal booking should still be created or activated only after vendor approval.
- Rule agreed: if the selected slot is no longer available when funding completes, the campaign should move into a recovery state rather than silently failing. Recommended v1 recovery is vendor-selected replacement slot or vendor rejection with refund obligations.
- Rule agreed: the vendor review capacity hold should last 24 hours by default in v1.
- Rule agreed: if the vendor takes no action before the 24-hour review hold expires, the campaign should become `vendor_review_expired`, release the hold, and make all verified contributions refund-eligible.
- Rule agreed: vendor approval/rejection starts only after full verified funding in v1.
- Rule agreed: before full funding, vendors may see a read-only funding-in-progress item, but they cannot approve, reject, reschedule, or hold capacity.
- Rule agreed: Vendor Admin and authorized Vendor Staff may see contributor display name, contribution amount, contribution status, submitted payment reference, proof image access, verification/rejection state, and refund status.
- Rule agreed: vendors should not see full contributor contact details by default unless the contributor is also the organizer/service contact or the detail is required for dispute/support handling.
- Rule agreed: the organizer remains the primary customer contact for the service booking.
- Rule agreed: after full funding, vendors may propose a replacement slot instead of approving or rejecting, but the organizer must accept the proposed replacement before the campaign can proceed.
- Rule agreed: vendors should not unilaterally reschedule a fully funded group-funded campaign after contributors have paid.
- Rule agreed: if the organizer declines the replacement slot, the campaign should move to vendor rejection/refund unless the vendor proposes another slot before the review deadline.
- Rule agreed: after vendor approval, the linked normal booking should be owned by the organizer, with the organizer as the primary service contact.
- Rule agreed: contributors remain group-funded participants and contribution owners, not normal booking owners.
- Rule agreed: vendor check-in should create one normal queue ticket for the organizer-owned booking, not one queue ticket per contributor.
- Rule agreed: once vendor approval creates the normal booking, scheduling, check-in, no-show, and status follow the normal booking lifecycle, while payment/refund accounting still points back to the group-funded contribution ledger.
- Rule agreed: if the vendor cancels the approved booking before service delivery, all verified contributions become refund-eligible.
- Rule agreed: if the organizer/customer no-shows or cancels after vendor approval, v1 should follow the vendor's normal cancellation/no-show policy and mark refunds as `policy_review_required` rather than automatically refundable.

## Answer

Vendor-side operations for group-funded booking should use a staged model:

1. During funding, the campaign does not hold capacity. Vendors may see a read-only funding-in-progress item, but they cannot approve, reject, reschedule, or reserve the slot.
2. When full verified funding is reached, GetPrio re-checks the selected slot. If it is still available, the system creates a short-lived `group_funded_capacity_hold` for vendor review. This is not a normal `bookings` row.
3. The vendor review hold lasts 24 hours by default. If the vendor takes no action before expiry, the campaign becomes `vendor_review_expired`, the hold is released, and all verified contributions become refund-eligible.
4. If the selected slot is no longer available when funding completes, the campaign enters a recovery state. In v1, the vendor can propose a replacement slot or reject the campaign and trigger refund obligations.
5. Vendor approval/rejection starts only after full verified funding. This avoids vendor review effort for campaigns that may never fund.
6. Vendor Admin and authorized Vendor Staff can review contributor display names, contribution amounts, contribution statuses, submitted references, proof images, verification/rejection state, and refund status.
7. Vendors do not see full contributor contact details by default unless the contributor is also the organizer/service contact or the detail is required for dispute/support handling.
8. After full funding, a vendor may propose a replacement slot, but the organizer must accept it before the campaign proceeds. Vendors cannot unilaterally reschedule a fully funded group-funded campaign.
9. If the organizer declines a replacement slot, the campaign should move to vendor rejection/refund unless the vendor proposes another slot before the review deadline.
10. After vendor approval, the linked normal booking is owned by the organizer, with the organizer as the primary service contact. Contributors remain participants/contribution owners, not booking owners.
11. Vendor check-in creates one normal queue ticket for the organizer-owned booking, not one queue ticket per contributor.
12. After approval, scheduling, check-in, no-show, and status follow the normal booking lifecycle. Payment and refund accounting remains attached to the contribution ledger.
13. If the vendor cancels before service delivery, all verified contributions become refund-eligible.
14. If the organizer/customer no-shows or cancels after vendor approval, v1 follows the vendor's normal cancellation/no-show policy and marks refunds as `policy_review_required` rather than automatically refundable.
