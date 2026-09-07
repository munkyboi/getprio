Type: implementation-ticket
Status: implemented
Blocked by: 08, 09

## Question

What customer UI should let organizers start private campaigns and contributors join, pay, track status, and understand refund outcomes?

## Scope

Implement the private customer experience:

1. Add group-funded mode to the existing booking flow for eligible branch/service selections.
2. Show computed required contribution, contributor count, deadline, visibility, and description fields.
3. Create private campaign detail pages accessible by share link.
4. Require login/registration before contribution proof submission.
5. Show verified vs submitted/unverified progress clearly.
6. Add organizer cancellation before full funding with anti-dark confirmation.
7. Add account surfaces for organizer campaigns, contributor campaigns, contribution proof state, funded state, refund-pending state, and confirmed linked booking state.

## Acceptance checks

1. The UI warns that the slot is not reserved until full funding and vendor approval.
2. Contributors cannot submit partial, extra, or uneven payment amounts in v1.
3. Guests can view safe private-link campaign details only through the share link but must log in to contribute.
4. Contributors do not see other contributors' private details.
5. Organizer cancellation explains refund consequences and defaults to keeping the campaign open.

## Implementation result

Implemented the private customer experience slice:

1. Added group-funded mode to the existing booking route with `/vendors/:tenantSlug/book/:serviceSlug?location=...&mode=group-funded`.
2. Added branch/service-gated group-funded controls for contributor count, computed exact contribution, funding deadline, visibility, and 280-character description.
3. Added a private campaign detail route at `/group-funded/:publicToken` with safe guest-readable campaign details, verified funding progress, share link copy, login-required contribution proof submission, and customer self-state.
4. Added organizer cancellation with anti-dark confirmation where `Keep campaign open` is the non-destructive default and `Cancel and start refunds` is explicit.
5. Added account navigation and a customer account group-funded campaign table for organizer/contributor campaign state.
6. Added a safe public campaign lookup endpoint plus organizer cancellation endpoint; public payload excludes participant lists, payment references, proof evidence, and refund evidence.

Verified with:

1. `npm --workspace frontend run build`
2. `npm --workspace frontend run typecheck`
3. `npm --workspace backend run test`

## Out of scope

- Public vendor-profile campaign listing.
- Platform moderation queues beyond required private description validation.
