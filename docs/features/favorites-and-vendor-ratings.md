# Favorites and vendor ratings

Mobile Home displays the first five favorites; View all favorites appears only when more exist. The shared editable sheet is also available under Account. Favorites are stored against the authenticated customer and vendor, and deleting a favorite leaves the vendor and all reviews unchanged.

Vendor details displays the favorite control, the aggregate rating and count, and up to five public reviews in a carousel. The review sheet fetches ten reviews per page. Public names use the first name and a masked surname. The API sends masked names, rather than depending on client-side masking.

A customer may review only their own served queue ticket, once per visit. Stars are required (1–5); comments are optional and limited to 500 characters. The mobile shell prompts when an observed active ticket becomes served; Do it later dismisses the prompt for that app session. Past served ticket details retain the review action. Existing booking reviews share the 500-character limit.

Vendor owners/admins with an active paid subscription can manage the Ratings dashboard, using the existing tenant.settings.manage permission. Free, inactive, missing, or unresolved subscriptions have no Ratings navigation or review controls; the API also rejects listing, visibility changes, and replies with 403. Customer review submission and public reviews remain available. Show publicly controls review visibility independently from platform moderation. Newly submitted reviews default to visible. Hiding a review excludes its comment from public pagination but leaves its active stars in the overall rating. Vendor visibility cannot restore platform-removed or disputed reviews.

## API

- GET /api/account/favorites — current customer's vendors.
- PUT /api/account/favorites/:tenantSlug — idempotent add for an active, approved, publicly listed vendor.
- DELETE /api/account/favorites/:tenantSlug — idempotent removal scoped to the current customer.
- GET /api/public/vendors/:tenantSlug/ratings?page=1&pageSize=5 — aggregate, public reviews and pagination metadata.
- GET /api/account/tickets/:lookupCode/rating — ownership-checked eligibility and existing rating.
- POST /api/account/tickets/:lookupCode/rating — submit stars and comment.
- GET /api/vendor/tenant/:tenantSlug/ratings?page=1&pageSize=10 — tenant-scoped moderation list with hasMore.
- PATCH /api/vendor/tenant/:tenantSlug/ratings/:reviewId — set boolean visible.

## Release and verification

Apply database/migrations/20260905_add_favorites_review_visibility.sql before starting the updated backend. Release the mobile build with the updated API; the new endpoints are required for these features. No production migration or deployment is part of this implementation.

The PostgreSQL regression test uses an isolated transaction/schema and rolls back all fixtures:

    FAVORITES_REVIEW_TEST_CONTAINER=getprio-dev-database-1 node --test backend/tests/favoritesReviews.postgres.test.cjs

Mobile regression coverage is in test/vendor_social_test.dart in the mobile-app checkout. It exercises the five-vendor limit, shared deletion, failed mutations, pagination, comment limits, served transitions, and sheet sizes.

Vendor-created walk-ins are excluded from dashboard queue alerts and vendor push notifications. The walk-in Customer name field uses the modal focus trap's data-autofocus target. The vendor Account tabs use compact, touch-sized tabs with a bold active label and underline, and horizontal scrolling at narrow widths.
