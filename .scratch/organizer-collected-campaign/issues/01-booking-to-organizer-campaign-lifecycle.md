# Booking-to-organizer-campaign lifecycle

Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: none

## Question

What canonical lifecycle separates the normal paid booking from its optional organizer-collected campaign, including vendor validation, campaign creation eligibility, campaign publish/join/review/close states, organizer cancellation, and the invariant that campaign outcomes never modify the underlying booking?

## Known direction

- The organizer pays the vendor booking before vendor validation.
- Only a vendor-validated booking may proceed into campaign creation.
- Campaign money is independently collected by the organizer and never gates booking confirmation or capacity.
- A campaign succeeds only when its fixed contributor-slot count is filled by organizer-accepted payments.

## Resolution

The normal Booking and the organizer-collected campaign are separate state machines. The booking remains authoritative for vendor validation, scheduling, capacity, service, and normal cancellation; the campaign records only organizer-to-contributor collection.

1. A customer opts into the campaign path while submitting a normal one-service or Service Bundle booking and pays the normal vendor booking amount. The booking follows the normal `pending` to `confirmed` vendor-validation path.
2. Only the organizer of a paid, `confirmed` booking may create an attached campaign. Creation starts as `draft`; no contributor can join it until the organizer publishes it.
3. The organizer publishes the campaign as share-link-only by default or public by explicit opt-in. Publication moves it to `collecting`. The deadline must be before the booking's scheduled start; creation, publication, and new contribution submission are forbidden once service has started.
4. During `collecting`, contributor slots are fixed. A contribution becomes part of the target only when the organizer accepts its proof. When every slot has an accepted contribution, the campaign moves to `collected` and accepts no further joins or proofs.
5. The organizer may cancel a `draft` or `collecting` campaign. If no accepted contribution needs money returned, it becomes `cancelled` immediately. Otherwise it moves to `refund_pending`, records the cancellation reason, stops new activity, and creates one reimbursement obligation for every affected contributor.
6. A missed deadline follows the same rule: no affected contributor means immediate `cancelled`; otherwise `refund_pending`. It never changes the paid, confirmed booking.
7. If the underlying booking is canceled by either the vendor or organizer, any attached `draft`, `collecting`, or `collected` campaign stops immediately and follows the same reimbursement path. The campaign retains the booking-cancellation reason for audit.
8. In `refund_pending`, the organizer records reimbursement evidence, but only each affected contributor's explicit confirmation completes that reimbursement. The campaign becomes `cancelled` only after every required confirmation is recorded.
9. `collected` means the collection goal was reached; it does not modify the booking and may still enter `refund_pending` if the underlying booking is later canceled.

## Resolution comment

Resolved as a post-confirmation, non-blocking collection lifecycle. Contribution-proof review safeguards, public-discovery rules, ratings, and the migration cutline remain in their respective tickets.
