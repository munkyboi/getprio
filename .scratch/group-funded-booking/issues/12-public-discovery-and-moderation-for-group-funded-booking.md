Type: implementation-ticket
Status: implemented
Blocked by: 09, 10, 11

## Question

How should public group-funded campaign discovery appear on vendor profiles without exposing private contributor, organizer, payment, or refund data?

## Scope

Implement public discovery after the private lifecycle works:

1. Add `Booking options` tabs to vendor profiles: `Standard` and `Group-funded`.
2. List public campaigns only for the selected vendor/branch when `allow_public_campaigns` permits them.
3. Show service, schedule, required contribution, verified progress, deadline, masked organizer identity, and moderated description.
4. Hide organizer contact details, participant list, payment proof, payment references, refund evidence, and internal events from public payloads.
5. Add description length validation, moderation/profanity checks, sanitized rendering, and report-abuse controls.

## Acceptance checks

1. Public payload tests prove privacy minimization.
2. Private-link campaigns do not appear in public vendor-profile discovery.
3. Public campaign cards route to safe campaign detail pages.
4. Report-abuse events are recorded and rate-limited.

## Implementation notes

- Added public vendor-branch discovery at `/api/public/vendors/:tenantSlug/locations/:locationSlug/group-funded-campaigns`.
- Public payloads use a dedicated formatter that masks organizer identity and excludes organizer user IDs, payment proof data, refunds, participants, internal events, and linked booking IDs.
- Public discovery SQL only returns `visibility = 'public'` campaigns for branch services that still allow public group-funded campaigns.
- Campaign descriptions are length-limited and checked by backend moderation before creation.
- Campaign detail pages include a rate-limited report action that records an internal `abuse_reported` event.

## Out of scope

- Human moderation queue unless flagged/reported content requires it.
- Generic crowdfunding discovery outside a vendor/service context.
