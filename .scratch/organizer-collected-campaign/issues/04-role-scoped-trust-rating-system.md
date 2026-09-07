# Role-scoped trust rating system

Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01, 02, 03

## Question

What rating records, eligibility triggers, visibility rules, aggregation, moderation, and abuse protections should implement public vendor ratings plus private vendor-to-organizer, organizer-to-contributor, and contributor-to-organizer trust signals?

## Known direction

- Customers rate vendors publicly only after completed service.
- Vendors rate organizers after completed service.
- Organizers rate contributors after contribution review.
- Contributors rate organizers after campaign closure.
- Individual-user ratings remain private to the authorized role relationship.

## Resolution

1. Every rating uses a one-to-five-star input. Aggregate display is intentionally minimalist: one gold star plus a numeric average and rating count. The detailed five-star input appears only when an eligible user is submitting a rating.
2. Each party may leave exactly one rating for each qualifying interaction: customer-to-vendor after a completed Booking; vendor-to-organizer after completed service; organizer-to-contributor after contribution review; and contributor-to-organizer after campaign closure. No pre-service, anonymous, or repeat rating is allowed.
3. Public customer-to-vendor reviews may include an optional moderated comment. The customer may revise the review once within seven days; the original and revision remain auditable. The vendor may make one moderated public reply.
4. Private user ratings use structured reason tags and an optional short private note. A one- or two-star rating requires a Low-Rating Reason category; comments are never forced.
5. Public vendor ratings expose the aggregate and moderated public review. Individual-user ratings remain private, but an aggregate average, rating count, and neutral status is reusable for the next role-relevant decision: vendors may see an organizer summary at booking validation, organizers may see contributor summary at join review, and contributors may see organizer summary before proof submission. Rater identity and private notes are never exposed. No rating automatically blocks a user in v1.
6. All rating types have a 30-day report/appeal path. A disputed rating is excluded from aggregate calculations pending Platform Admin review. Public content may be temporarily hidden for abuse, personal-data exposure, or clear falsehood; private content remains case-scoped during review.

## Resolution comment

Resolved as a minimal five-star UX with distinct public vendor reputation and private role-scoped trust summaries. The decision deliberately avoids automatic eligibility penalties and leaves final data retention and legal implementation detail to the legal and rollout tickets.
