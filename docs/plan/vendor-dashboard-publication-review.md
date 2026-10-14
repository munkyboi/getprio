# Remaining vendor dashboard presentation: publication review

Prepared 15 October 2026 for Carlo. Current unpublished branch: codex/vendor-services-availability, synchronized with main98281ba7. The local preview remains http://localhost:5179/dashboard/services. Carlo authorized publication on15October2026. Publish this package as a draft PR; merge, deployment and runtime activation require their separate gates.

Proposed PR title: Rework remaining vendor dashboard screens and access states

## Proposed scope

- Services and Availability: catalog, quantities, weekly hours and date exceptions with preserved contracts and draft/retry guards.
- Staff: scoped roster, seat/access rules, confirmed role/status/removal and add-member retry.
- Settings and Queue Board: business profile, notifications, queue settings and confirmed private/public board/display management.
- Account: profile, MFA/contact/deletion tasks, subscription/billing and capacity/paid-exit presentation, with shared customer fallback retained.
- Reports and Ratings: authoritative/unknown usage, accurately named recorded activity, scoped pagination/moderation and retry behavior.
- Vendor onboarding, Login/reset/MFA/callback and scoped operational/transient notifications; customer defaults and logout-surviving deletion receipt preserved.
- Loading, missing-workspace and subscription-required states; removal of dedicated legacy styles only after their callers are gone.
- Updated design rules, audit preservation evidence, migration inventory, progress and work tracker.

The separate approved email-retirement PR#433 has merged atce8150e3 and its automatic deployment passed. This local package is synchronized with main98281ba7, which includes#433, and retains the native rework presentation while incorporating the retirement fixes. Any eventual PR must compare against current main so the already merged retirement changes are not reviewed twice. No backend/shared-type changes are proposed beyond already merged main. Publication is authorized; hosted review and acceptance gates remain pending.

## Verification

Latest current-main synchronization passes214 frontend tests, TypeScript and production build. Affected-source lint and independent specification/standards reviews passed during each implemented slice. Responsive synthetic mutation/retry/discard/role checks are recorded per slice in vendor-dashboard-rework-progress.md; these are not production mutation evidence.

Separate actual #433/#434/#436 integration used real password/TOTP login, disposable PostgreSQL and API responses without interception. Nullable usage, conservative projected credits, ticket-only catalog, retired metrics and public-ticket email policy passed across375/768/1180/1440. This acceptance applies to the retirement consumers; it does not certify all unpublished screens against live providers.

## Required acceptance still outstanding

- Authenticated production mutations, real OAuth/mail/payment/deletion provider outcomes and direct-device keyboard/authenticator/physical QR/display-cookie behavior where recorded per slice.
- Workflow and simultaneous pooled service remain blocked on authoritative ticket/session/allocation snapshot/stream contracts, complete writer/watermark/reconciliation readiness and pilot authorization. Counter lanes/configured pools do not satisfy that requirement.
- Self-account phone removal has no supported API contract and remains an explicit gap.
- Required GitHub approval/checks on the eventual published head and exact deployment/post-deploy acceptance.

## Proposed PR description

Migrate the remaining vendor dashboard presentation to the approved scoped shell and native controls, covering Services/Availability, Staff, Settings/Queue Board, Account, Reports/Ratings and shared vendor auth/notifications. Preserve existing routes, server authorization/business contracts, draft/retry guards and shared customer defaults. Remove dedicated legacy presentation only after the last callers migrate.

Validation:214 frontend tests, TypeScript and build pass on the branch synchronized with main98281ba7. Per-slice lint, independent reviews and responsive/role/retry/confirmation fixtures are recorded in the rework evidence. Provider/device/authenticated/deployed acceptance gaps remain explicit. Simultaneous resource-pool/workflow activation remains gated and is not implemented by this presentation PR.

Publish as draft for review. Do not merge, deploy or activate runtime gates as part of publication.

The merged current-period usage fix#444/#445 is integrated into the native rework: Reports retains daily location activity and recorded intervals while monthly canonical usage is independent of bootstrap errors. Account Subscription uses the same metric with owner/admin visible-tab polling; exact shared TenantPeriodUsageResponse is imported from merged API contracts. Native retry/layout controls are retained. Already merged changes must be excluded from the eventual main-based review diff.
