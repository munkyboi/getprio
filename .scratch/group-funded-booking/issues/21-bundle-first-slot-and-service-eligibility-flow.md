# Bundle-first slot and service eligibility flow

Type: implementation-slice
Status: implemented
Claimed by: Codex (/root)
Blocked by: none

## Question

How should the group-funded booking form let an organizer choose a branch-level time first, then build a bundle from only the services that can fulfill that time, without a primary-service schedule anchor?

## Product direction

Replace the primary-service flow with this organizer sequence:

1. Select branch.
2. Select date.
3. Set units / hours.
4. Select a candidate slot generated from the branch's business hours for the requested duration.
5. Select one or more services. Each service is enabled only when it is group-funded-enabled and can fulfill the selected branch, date, units, and slot.
6. Set required contributors, funding deadline, title, and description.
7. Submit the campaign.

The service picker is the source of truth for a bundle. There is no primary service in the customer experience. A service that becomes ineligible after the branch, date, units, or slot changes must be removed from the selection and shown with a reason.

## Scope boundary

1. Keep bundles parallel: every selected service begins at the chosen slot; the campaign end is the latest selected service end.
2. Calculate the initial candidate slots from branch business hours and the requested duration. A short overnight remainder is not selectable when it cannot fit the requested duration.
3. For each service, evaluate weekly availability, date exceptions, existing bookings, active group-funded holds, location-service eligibility, and the service's capacity scope for the entire requested time range.
4. Display unavailable services as disabled with an actionable reason, such as outside service availability, unavailable exception, existing booking, full capacity, or group-funded disabled.
5. Require at least one selected service. The request should use `bundleItems`; do not use a client-selected primary service to determine availability or schedule.
6. Preserve a legacy campaign-level service reference only as a server-derived compatibility/display field if existing storage still requires it.
7. Revalidate every selected item transactionally on submission and again at the existing vendor-review/hold transition. Client-side disabling is guidance, not authorization or reservation.

## Acceptance checks

1. Court 1 + Court 2 can be selected only if both are available for the entire chosen slot and duration.
2. If Court 2 has a 2–5 PM booking, it is disabled for a 2–5 PM candidate slot while Court 1 can remain selectable if free.
3. No campaign can be created with a selected service outside its weekly availability or exception window, even through a direct API request.
4. Changing branch, date, units, or slot immediately recalculates service eligibility and removes invalid selections with an explanation.
5. Single-service group-funded campaigns remain supported as one-item bundles.
6. Existing contributor funding, refunds, vendor review, per-item capacity holds, and privacy-safe DTOs remain unchanged.

## Implementation notes

The existing ticket `20` keeps a selected service as the primary schedule anchor. This ticket supersedes that customer-flow decision while retaining the backend `bundleItems` model from ticket `19`.

## Resolution

The organizer flow now uses the branch as the scheduling anchor: it selects a date, requested units/hours, and a branch-business-hours candidate slot before selecting one or more eligible services. Candidate slots use the requested duration and omit overnight remainders that cannot fit it.

Each eligible branch service is checked independently for its weekly availability, date exceptions, ordinary booking capacity, and active group-funded review holds. The picker disables ineligible services, explains whether the selected slot is unavailable or full, and removes services that become ineligible when the organizer changes date, units, or slot. Submission requires at least one selected service and sends `bundleItems`; the legacy campaign service reference is derived from the first selected item only.

The backend independently rechecks availability for every selected bundle item at campaign creation and at later review/hold transitions.

Verified with:

- `node --test backend/tests/bookingService.test.cjs backend/tests/groupFundedBookingService.test.cjs`
- `npm --workspace frontend run typecheck`
- `npm --workspace backend run typecheck`
- `npm --workspace frontend run build`
- `git diff --check`
