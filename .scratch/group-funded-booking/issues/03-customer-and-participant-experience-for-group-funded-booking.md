Type: prototype
Status: resolved
Blocked by: 01

## Question

What customer-facing experience should GetPrio present for starting, sharing, joining, funding, tracking, and recovering a group-funded booking, including participant progress, payment prompts, deadline warnings, funded state, and failed-target refunds?

## Working notes

- Rule agreed: organizers choose campaign visibility at creation time.
- Rule agreed: v1 supports both `Private link only` and `Public on vendor profile` visibility.
- Rule agreed: private campaigns remain accessible by share link but do not appear in public vendor-profile discovery surfaces.
- Rule agreed: public group-funded campaigns appear under a separate `Group-funded` tab on the vendor profile for the selected vendor/branch.
- Rule agreed: the vendor profile services area should be reframed as `Booking options` with two tabs: `Standard` and `Group-funded`.
- Rule agreed: the `Standard` tab keeps normal service booking cards, while the `Group-funded` tab lists organizer-published public funding campaigns with a `Join funding` CTA.
- Rule agreed: organizers can start a group-funded booking from each eligible `Standard` service card via a secondary `Start group-funded` CTA.
- Rule agreed: the public `Group-funded` tab should also include a `Start a group-funded booking` CTA, including the empty state.
- Rule agreed: the start flow should route into the existing booking flow with group-funded mode preselected, using a shape like `/vendors/:tenantSlug/book/:serviceSlug?location=...&mode=group-funded`.
- Rule agreed: organizers can add a group-funded booking description visible on the campaign page and, when public, on public campaign cards.
- Rule agreed: the organizer campaign description is limited to 280 characters.
- Rule agreed: organizer campaign descriptions must pass the app's profanity/moderation filter before publication.
- Rule agreed: public campaign cards should show only masked organizer identity, such as first name plus last initial, or a generic organizer label when needed.
- Rule agreed: public campaign cards must not expose organizer phone, email, full name, payment details, or participant list to guests.
- Rule agreed: guests may open a public group-funded campaign detail page and see safe public campaign details.
- Rule agreed: joining/contributing requires login or customer registration before payment proof upload, so contribution ownership, refunds, abuse controls, and audit history are tied to a Customer account.
- Rule agreed: v1 uses one fixed exact required contribution per contributor.
- Rule agreed: v1 does not support tipping, overfunding, partial payments, uneven shares, or optional extra contributions.
- Rule agreed: customer-visible cancellation flows must apply anti-dark patterns, including clear consequences, neutral action labels, and a non-destructive default path.
- Rule agreed: the organizer may cancel a public or private campaign after at least one contributor has paid but before full funding.
- Rule agreed: organizer cancellation before full funding must use a strong anti-dark confirmation modal explaining that all verified contributions become refund-eligible and the campaign cannot be reopened.
- Rule agreed: the organizer cancellation modal should default to `Keep campaign open`, with the destructive action labeled `Cancel and start refunds`.

## Answer

Customer and participant experience for group-funded booking should extend the existing booking journey rather than create a separate crowdfunding product:

1. The vendor profile should reframe the service area as `Booking options` with two tabs: `Standard` and `Group-funded`.
2. `Standard` keeps the existing branch-scoped service cards and normal `Book` CTA.
3. `Group-funded` lists organizer-published public campaigns for the selected vendor/branch. Private campaigns remain accessible by share link only.
4. Eligible `Standard` service cards should offer normal `Book` and secondary `Start group-funded` actions.
5. The `Group-funded` tab should also offer `Start a group-funded booking`, including in the empty state.
6. The organizer start route should reuse the existing booking flow with group-funded mode preselected, using a shape like `/vendors/:tenantSlug/book/:serviceSlug?location=...&mode=group-funded`.
7. Organizers choose campaign visibility at creation: `Private link only` or `Public on vendor profile`.
8. Public campaign cards show service, schedule, required contribution, verified funding progress, deadline, masked organizer identity, optional organizer description, and `Join funding`.
9. Organizer campaign descriptions are capped at 280 characters and must pass profanity/moderation checks before saving or publication.
10. Public cards must not expose organizer phone, email, full name, participant list, payment proof, payment references, or refund details.
11. Guests can open a public campaign detail page and see safe public campaign details, but joining/contributing requires login or customer registration.
12. The organizer flow starts from the existing vendor booking path: branch, service, quantity if applicable, date, slot, contact details, and booking mode.
13. Selecting `Start group-funded booking` adds funding fields: required contribution, max contributors/target, deadline, invite note, visibility, and description.
14. The flow should warn clearly that the slot is not reserved until the campaign is fully funded and vendor-approved.
15. Contributors pay exactly one fixed required contribution in v1. No tipping, overfunding, partial payments, uneven shares, or optional extra contributions.
16. Funding progress must separate verified contributions from submitted/unverified payment proofs.
17. Contributors see their own contribution, payment proof, verification, rejection, and refund state. They do not see other contributors' private details.
18. The organizer can cancel before full funding, even after contributors have paid, but the confirmation must use anti-dark patterns.
19. Organizer cancellation confirmation defaults to `Keep campaign open`; destructive action is `Cancel and start refunds`; copy explains that all verified contributions become refund-eligible and the campaign cannot be reopened.
20. Fully funded, expired, vendor-rejected, refund-pending, and confirmed states should be visible in the campaign page and customer account surfaces.

## Prototype assets

- [Customer and participant experience prototype](../assets/03-customer-and-participant-experience-prototype.md)
