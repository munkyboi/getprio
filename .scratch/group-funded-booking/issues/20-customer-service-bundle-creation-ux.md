Type: implementation-slice
Status: implemented
Blocked by: 19

## Question

What minimal customer booking-flow change lets an organizer create a group-funded Service Bundle, such as VIP Court + Court 1, using the backend `bundleItems` support from ticket `19`?

## Scope boundary

1. Keep the existing `/vendors/:tenantSlug/book/:serviceSlug?mode=group-funded` entrypoint.
2. Treat the selected service as the primary schedule anchor.
3. Let organizers add other group-funded-enabled services from the same branch to the same campaign.
4. Keep single-service campaigns as the default one-item bundle.
5. Submit `bundleItems` with service slug and booking quantity to the existing account campaign creation endpoint.
6. Do not add per-item time selection in this slice; v1 bundle items share the primary start time and are validated by the backend.

## Resolution

The booking request page now exposes a Service Bundle picker when a branch has more than one group-funded-enabled service. The primary service remains selected and disabled in the bundle list, while organizers can add or remove other eligible branch services.

The form now calculates the bundle total from the selected services, displays the exact equal contribution amount, and sends a `bundleItems` array in the group-funded campaign creation payload. The shared `CreateGroupFundedCampaignRequest` type documents the payload shape.

The group-funded stepper now uses the campaign lifecycle instead of the standard booking OTP/payment flow: Set Up Campaign, Funding, Vendor Review, and Confirmed Booking. Manual-payment copy in group-funded mode now points contributors to the post-creation campaign proof flow instead of saying the organizer will upload proof after OTP verification.

Verified with:

- `npm --workspace frontend run typecheck`
- `npm --workspace backend run typecheck`
- `npm run lint`
- `npm --workspace frontend run build`
- `node --test backend/tests/groupFundedBookingService.test.cjs`
- `git diff --check`
