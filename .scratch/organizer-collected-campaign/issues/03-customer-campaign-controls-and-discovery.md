# Customer campaign controls and discovery

Type: prototype
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01

## Question

What customer-account routes, navigation, page composition, campaign-management controls, contributor journey, and privacy-minimized public/share-link discovery surface should replace the legacy vendor-dashboard campaign workflow while preserving the normal booking flow?

## Known direction

- The booking flow exposes an opt-in group-funded toggle before normal payment.
- Campaign creation follows vendor validation and lets the organizer set title, description, deadline, payment instructions, contributor count, and contribution fee.
- Share-link visibility is the default; a signed-in public listing is explicit opt-in.

## Resolution

The customer-facing source of truth is a mobile-first Campaign Control Center, not a vendor dashboard.

1. Customer navigation uses a **Campaigns** account section. It lists campaigns where the customer is the organizer or contributor, while the linked booking remains in **Bookings**.
2. A confirmed booking detail shows **Create campaign** if no campaign exists and **Manage campaign** once one does. Vendor confirmation triggers a dismissible create-campaign prompt; dismissal leaves the booking unchanged and preserves the later booking-detail entry point until the start-time cutoff.
3. The organizer route is `/account/campaigns/:campaignId/manage`. It owns campaign setup, publish/unpublish, visibility, contributor review, reimbursement, reports, history, and the campaign-level share action. The existing public campaign route remains a compatibility decision for the rollout ticket.
4. The control-center hero uses the selected image-backed layout: a centered campaign mark, funding progress, join fee, booking schedule, contributor count, and one **Copy share link** action. It is mobile-first: stacked metrics and full-width actions on narrow screens, with desktop grids only as enhancement.
5. The organizer sees a private contributor roster containing contributor identity, slot state, submitted/accepted/review-overdue/reimbursement state, and the relevant action. The roster never embeds payment evidence; evidence opens only from a scoped review or reimbursement action.
6. The share link is generic to the campaign, not individualized to a contributor slot. Open slots are passive availability states; no per-slot share control exists. Link visitors may view a privacy-minimized preview, but sign-in is required before joining, seeing payment instructions, submitting proof, rating, or reporting.
7. Public discovery is signed-in-only and opt-in. It exposes only the privacy-minimized campaign surface; public viewers do not see contributor identity, payment evidence, contact details, private ratings, organizer controls, or reimbursement data.

## Prototype outcome

Three disposable UI variants were compared on `/account/campaigns/prototype`; **Control center** was selected. The prototype is removed after this decision, and the validated layout is recorded here for future implementation.

## Resolution comment

Resolved as a mobile-first organizer control center connected to the booking detail and customer campaign list. Production routes, API shape, public-route compatibility, ratings, and rollout remain separate work.
