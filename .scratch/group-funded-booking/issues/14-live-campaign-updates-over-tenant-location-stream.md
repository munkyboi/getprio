## Question

How should group-funded campaign changes update open vendor/customer screens without adding a separate polling loop?

## Decision

Reuse the existing tenant/location server-sent event stream as the near-real-time invalidation signal for group-funded campaign changes. Keep the public stream response compatible with the current queue snapshot payload, but publish into that stream after group-funded campaign mutations so already-open vendor dashboard and customer campaign pages can reload the affected data.

For v1, this is intentionally a compatibility-safe branch-change signal rather than a full event-bus redesign:

- Queue screens continue to receive queue snapshots from the existing `/public/tenant/:tenantSlug/location/:locationSlug/stream` route.
- Group-funded service mutations publish to the same stream after durable campaign/contribution/review changes complete.
- Vendor dashboard invalidates group-funded campaign list, detail, and alert-event queries when the stream emits.
- Public/customer group-funded campaign detail listens to the same stream and reloads the campaign when the branch changes.
- WebSockets and a separate group-funded stream are out of scope for this slice; SSE is already present and sufficient for the capstone.

## Implementation checklist

- Add a small backend helper that publishes a tenant/location stream update for group-funded campaign changes.
- Call it from campaign create, contribution proof submit/reject/verify, funding completion/vendor review start, vendor approve/reject, organizer cancel, and replacement-slot decisions.
- Update `VendorDashboardPage.tsx` stream listener to invalidate group-funded queries when the group-funded section/detail/alerts are active.
- Update `GroupFundedCampaignPage.tsx` to subscribe to the campaign branch stream and reload on messages, with visibility refresh as a fallback.
- Keep existing queue and booking stream behavior intact.

## Resolution

Implemented as a compatibility-safe SSE wake-up. Group-funded mutations publish into the existing tenant stream without a custom payload, so current queue consumers still receive the normal queue snapshot while group-funded screens use the event as an invalidation signal. Vendor dashboard group-funded list/detail/alerts invalidate from the stream, and public/customer campaign detail reloads silently when its branch stream emits.
