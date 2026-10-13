# Vendor dashboard rework progress

13 October 2026. Source baseline `f7435a22`; implementation branch `codex/vendor-workspace-shell`.

## Slice 1: shared shell

Implemented Operations/Administration navigation over the existing feature handlers, owner/admin switching and permitted staff/account navigation, a business/location selector, responsive shadcn/Base UI navigation sheet, scoped semantic light/dark shell tokens, theme persistence/system default, and per-actor/tenant workspace preference. Existing `/dashboard/*` routes remain canonical in this slice with an explicit `workspace` query value; proposed `/operation` and `/admin` roots are deferred until feature-route extraction. Existing approval/payment queries and hashes remain preserved. Root navigation waits for identity loading before selecting a remembered permitted workspace.

Business context changes clear the old snapshot and feature lists and reset selected counter/scanner state. Pending submissions block shell navigation. Existing feature forms get unsaved-edit navigation/unload protection; successful settings/profile saves clear their edit flag. Legacy task dialogs remain mounted with existing handlers and confirmations. Queue lifecycle, secure board and commercial APIs are unchanged.

The shell is the first migration slice, **not the completed dashboard rework**. Mantine feature screens and their overlays retain their existing light presentation inside the new themed frame until migrated. Workflows/stations/resources runtime and AI publication remain separately gated. No empty future-feature navigation is introduced.

## Verification

- Frontend suite: 159 passed, 0 failed. Four focused workspace tests cover staff restriction, existing entitlement-filtered navigation, query/hash preservation and blocked preference storage. Retired one source-regex test for the old sidebar layout; its alignment contract is checked in the responsive shell fixture.
- Frontend typecheck and affected-source ESLint passed; production frontend build passed with existing large-chunk advisory.
- Synthetic browser shell fixture at 375, 768, 1180 and 1440 pixels: no horizontal document overflow. Mobile sheet opened, Escape closed it, focus returned to its invoking button, and theme survived reload. This fixture uses no vendor data or writes and is not authenticated operational acceptance.
- React 18 compatibility: generated Base UI Button forwards its DOM ref; navigation sheet portals stay inside the scoped vendor token container. New controls use minimum 44-pixel targets.
- Bitwarden is locked and this checkout has no restored `.env` / `.env.local`; authenticated local backend testing remains unavailable. No hosted database or email mutation was performed.

## Remaining rework

Migrate Operations queue/scanners/lifecycle and bookings/clients/history; Administration locations/counters/services/availability/staff/settings/board; shared account/security and commercial/reporting/ratings; auth/onboarding; capability-gated workflow/resource editor/setup. Each slice follows the full audit inventory and updates these progress notes, migration plan and UI rules with implementation and acceptance evidence. Main/current PR merge, deployment and authenticated/device acceptance remain separate states.

## Coordination

Queue/runtime owner confirmed no overlapping files or contract changes; preserve COUNTER_POLICY_BUSY 409, stale configuration conflicts and selected-counter reset. Its deployed writer PRs are distinct from outstanding live mutation acceptance. AI owner confirmed no shell blocker: requested policy is distinct from effective readiness and resource-start shadow targets differ from call-time baseline wait. Mobile owner confirmed public quantity fields and frozen bookings must be preserved; PR27 fresh review/device/live parity remains separately pending. Platform was notified of shell/dependency/docs ownership; no platform/backend/shared payload edits are part of this slice.
