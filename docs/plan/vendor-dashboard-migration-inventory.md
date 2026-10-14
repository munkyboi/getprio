# Vendor dashboard migration inventory

Implementation status: see [rework progress](vendor-dashboard-rework-progress.md). Slice 1 retains existing `/dashboard/*` routes with explicit workspace state; canonical workspace-root proposals remain staged.

Status: implementation proposal created 5 October 2026; audited against fetched `origin/main` `f7435a22` on 13 October 2026. See the [full audit](vendor-dashboard-full-audit.md) and [preservation checklist](vendor-dashboard-rework-preservation-checklist.md) for mandatory section/state coverage. Documentation is not runtime activation evidence.

Authority: [completed decisions](vendor-dashboard-workflow-decisions.md), [design brief](vendor-dashboard-rework-design.md), [UI rules](../design/vendor-ui-rules.md), and [queue foundation specification](queue-workflow-foundation-spec.md). Product decisions in the completed record take precedence over proposed names below.

## Historical inspection baseline

Current rework checkout: `web-app/worktrees/vendor-secure-queue-board`, branch `codex/vendor-workspace-shell`. Fetched main baseline: `f7435a22`. At this inspection baseline the frontend used React/Vite/Mantine and the dashboard still combines navigation, queries, forms, dialogs and operations. At that baseline the shadcn/Tailwind foundation was unconnected. The progress record supersedes this historical implementation status. Extract by feature boundaries rather than copying the dashboard into two wrappers.

Existing `platform-dashboard-shadcn/components.json` provides a local precedent: non-RSC TypeScript, CSS variables, neutral base, Lucide, and `@/components/ui` aliases. This is a precedent to evaluate, not an instruction to share the Platform Admin shell or blindly copy its primitive family. Choose the vendor primitive/configuration convention in the first shell slice and keep its generated components consistent.

## Route migration proposal

Canonical paths below are proposed within the existing vendor application. Host/DNS changes are unnecessary. The workspace switch changes navigation within the authenticated session, preserves permitted tenant/location context, and never consumes a seat.

| Existing route/section | Proposed destination | Migration behavior |
| --- | --- | --- |
| `/dashboard`, `/dashboard/queue` | `/operation` | Owner overview for multiple permitted stations; open station directly for one. Keep old links as compatibility redirects. |
| Queue station view, new | `/operation/stations/:stationId` | Waiting, Called, In service and Awaiting arrival; scope every request to tenant/location/station. |
| Journey detail, new | `/operation/journeys/:journeyId` | Relevant operational progress and authorized actions; opaque identifiers do not grant access. |
| `/dashboard/bookings` | `/operation/bookings` | Preserve existing booking detail, proof, check-in and reschedule flows and their authorization. |
| `/dashboard/clients` | `/operation/clients` | Retain limited operational customer information; do not widen staff visibility. |
| `/dashboard/history` | `/operation/history` | Preserve scoped history, export permissions and current retention entitlement. |
| `/dashboard/tenants` (Locations) | `/admin/locations` | Preserve business/location management distinctions. |
| `/dashboard/services` | `/admin/services` | Add links to optional workflow/resource mapping; ordinary services remain usable. |
| `/dashboard/staff` | `/admin/staff` | Retain membership/seat rules; add station assignments without replacing location/counter scope. |
| `/dashboard/reports` | `/admin/reports` | Administrative reporting; preserve currently authorized operational reports through explicit Operations links where required. |
| `/dashboard/ratings` | `/admin/ratings` | Vendor reviews only. |
| `/dashboard/settings` | `/admin/settings` | Contact, queue and notification settings retain separate action permissions. |
| `/dashboard/account` subscription/billing | `/admin/billing` | Preserve current owner/admin billing permissions, capability/confirmation contracts and checkout-return context. |
| `/dashboard/account` profile/security | `/operation/account` and `/admin/account` | One shared account feature with workspace-specific shell; staff retain self-profile/MFA access. |
| Queue setup, new | `/admin/queue-setup?tab=workflows\|stations\|resources` | One sidebar item, three page tabs, no required submenu. Default tab Workflows. |
| Setup detail, new | `/admin/queue-setup/workflows/:id`, `/stations/:id`, `/resources/:id` under the same prefix | Selected tab stays apparent; service forms deep-link to the correct entity. |
| Optional onboarding, new | `/admin/onboarding` | Basic setup first; optional drafts may be skipped; publishing/enabling remains explicit. |
| `/login`, `/register/vendor` | Keep existing paths | Apply reference layouts while preserving shared identity/auth contracts. |
| `/oauth/callback`, `/payment/return` | Keep existing paths | Validate and translate vendor return paths without breaking customer flows. |
| Public vendor, join and joined-ticket paths | Keep existing paths | Preserve customer flows; do not apply the authenticated vendor shell. |
| `/queue-board/:boardId` | Keep secure board path | Preserve UUID identifier, server access checks, approval QR, browser grants and existing board UI/UX. |
| Legacy monitor paths | Keep retirement behavior | No public board access; retain existing ticket/payment redirects and retired-link message. |

Before replacing a section, enumerate its actual query parameters, tab state, detail identifiers, email links, payment return links and browser history behavior. The compatibility adapter translates those verified values, preserves search/hash where meaningful, and validates permitted destinations. Unsupported destinations show a useful safe landing, never an open redirect. A staff-only link resolves to permitted Operations; MFA-required users reach account security before protected dashboard queries load.

## Source seams and component ownership

| Source today | Responsibility after migration | Required compatibility work |
| --- | --- | --- |
| [App.tsx](../../frontend/src/App.tsx) | Vendor route boundary and lazy workspace routes | Current shell recognizes `/dashboard` by pathname prefix. Update shell ownership, not only route declarations. Retain the development queue-close prototype intentionally. |
| [VendorDashboardPage.tsx](../../frontend/src/pages/VendorDashboardPage.tsx) | Incrementally retire orchestration into feature screens | Preserve query invalidation, socket reconnects, alerts, busy states, confirmations and selected tenant/location. |
| [vendorDashboardNavigation.js](../../frontend/src/lib/vendorDashboardNavigation.js) | Compatibility route mapping and permitted landing selection | Check role and feature filtering; remember only a still-permitted workspace. |
| [vendorDashboardBootstrap.js](../../frontend/src/lib/vendorDashboardBootstrap.js), dashboard bootstrap API | Shared vendor context boundary | Scope cache keys by actor/tenant/location and clear inaccessible state on role/context changes. |
| Dashboard queue API module | Ordinary queue adapter and station operation client | Preserve ordinary payloads until station APIs are available; do not fake station concurrency client-side. |
| Dashboard catalog, bookings, billing and export API modules | Feature-owned client interfaces | Reuse request/error contracts; migrate screen styling independently of API rewriting. |
| Dashboard operations/mutations API modules | Split by actual account/settings/staff/operation responsibility | Names are not proof of domain ownership; move only callers required by each slice. |
| `VendorQueueLifecycleTray`, `VendorCapacityPanel` | Operations lifecycle and explicit capacity evidence panels | Projection diagnostics must remain distinct from allocated/available resource counts. |
| `VendorRatingsPanel`, `VendorAccountDeletionPanel`, `EmailMfaSettingsPanel` | Ratings, account deletion and shared security features | Preserve destructive confirmations, account-deletion semantics and actual MFA factors. |
| [LoginPage.tsx](../../frontend/src/pages/LoginPage.tsx), [RegisterVendorPage.tsx](../../frontend/src/pages/RegisterVendorPage.tsx), AuthContext | Shared identity plus vendor presentation | Preserve password/OAuth/challenge flows, TOTP/recovery/email verification, vendor completion endpoint, required MFA and customer return paths. |
| `vendorTheme.ts` | Public-board theme concern, evaluated separately | Do not confuse public board branding with vendor light/dark preference. |

Proposed shared UI: `VendorWorkspaceShell`, `WorkspaceSwitcher`, `TenantLocationSelector`, `VendorThemeProvider`, `TaskDialog`, `ResponsiveDataList`, and the shared account/security feature. Operations owns station/journey/session views. Administration owns configuration and reporting. These are implementation boundaries, not a requirement to create empty abstractions before callers exist.

## Authorization and commercial compatibility

The runtime roles are owner/admin/staff. The product label Vendor Admin does not erase owner-only actions. Source permissions in [permissions.js](../../backend/src/services/permissions.js) distinguish owner-only contact/public-board theme from owner/admin billing and broader administration. Dashboard source currently limits staff to queue/bookings/clients/history/account, and forces account-only navigation during required MFA enrollment. Preserve self-service account access even when Administration is unavailable.

`vendorManagementHandlers.js` enforces staff membership creation against `entitlements.staffSeats` and exposes `staffSeatLimit`. Workspace switching is not staff creation. Confirm owner inclusion and subscription seat semantics through the policy/tests before presenting numeric remaining seats; the user's one-seat owner scenario must work without a second membership.

[entitlementAdmissionService.js](../../backend/src/services/entitlementAdmissionService.js) currently handles existing feature keys and release-control bypasses. `shared/types.ts` has no workflow feature key. Add an explicit server workflow capability; do not infer it from a hidden tab or let a legacy enforcement bypass enable new workflows. Read, new intake and existing-journey resolution are distinct capabilities. Resource-only activation requires separate pilot authorization.

## Required feature-level coverage

The [full audit inventory](vendor-dashboard-full-audit.md#all-section-migration-inventory) is part of this migration contract. It includes all eleven sections plus counters/resources/availability, booking proof/check-in/no-show/reschedule, staff lifecycle, QR variants/board approvals, notifications, retention/exports/reviews, credits/plan exit and shared recovery/deletion. Each migrated slice records action-level permissions, context transitions, failure states, responsive task evidence and unresolved checks.

## Reuse from adjacent work

Resource configuration previously inspected on `booking-arrival` is now present in fetched `origin/main`: `resourceConfigurationService.js`, `VendorResourceConfiguration.tsx`, extracted `VendorResourceConfigurationForms.tsx`, scoped CSS, vendor GET/PUT routes and stale-version handling. Reuse the merged slice from main; no separate cherry-pick of its old feature commits is needed. Its current UI lives in Locations → Resources. Retain Locations → Resources for the authorized local review slice; move its single editor into Queue setup → Resources only in the future configuration/runtime slice while preserving both location/service management requirements and `trackingAvailable: false`. This turn verified merged source, not live interactions.

The inspected foundation migration constrains `tracking_enabled = FALSE`. Changing that constraint requires the operational ledger and concurrency acceptance in the [foundation specification](queue-workflow-foundation-spec.md); a configuration screen cannot lift it by itself.

## Merged operation contracts to preserve

Main now contains optional customer booking arrival and the earliest-call gate, branch service timing start/complete/interrupt, unfinished timing recovery, and immutable ticket service-plan capture. The shell/ordinary queue slice must retain:

- `customerSelfCheckInEnabled` and `serviceTimingEnabled` location settings; ordinary opt-out vendors still use Call next → Serve customer.
- Ticket-ID-targeted timing actions, confirmation prerequisites, disabled-confirm button behavior, and unfinished timing resolution after closure/setting disablement. A timing record does not imply allocation.
- Optional walk-in `serviceId`, branch-scoped minimal service options and selection reset on tenant/location change. Booking arrival captures plan items transactionally; quantity does not multiply units.
- Snapshot fields `serviceStartedAt`, `bookingScheduledStartAt`, `unfinishedServiceTiming`; keep unfinished records vendor-only through existing stream/read stripping.
- Existing saved booking/branch context and `/vendors/:tenantSlug/bookings/:bookingId`; public/customer routes remain outside the vendor shell.
- Incoming waiting-ticket cancellation [PR #311](https://github.com/munkyboi/getprio/pull/311), reported head `808ed0be`, CI/review pending: retain the light red row action and confirmation. Its POST `/api/vendor/tenant/:tenantSlug/queue/tickets/:ticketId/cancel?location=...` requires ticket update-state permission and existing location access, locks the scoped ticket and rejects non-waiting states. Preserve cancellation events, censored outcomes, notifications and snapshots. Avoid overlapping edits until the accepted diff is integrated. See the coordination record and PR-branch `docs/plan/vendor-waiting-ticket-cancellation.md`. This action does not cancel called/in-service work or release resources.

The first slice presents existing location queues. A default-station adapter is a future server compatibility boundary, not permission to fabricate station IDs or parallel service support in the client. Stations/journeys remain unavailable until their runtime contracts exist.

See [cross-thread coordination](vendor-dashboard-ai-coordination.md) for shared-file ownership, estimate semantics and the bounded first slice.

## Reviewable migration slices

1. **Shell and ordinary queue:** choose/configure shadcn and isolated styles, vendor theme persistence, shared session/context, workspace switch, role-aware landing, account security and compatibility routes. Prove one-seat switching and existing queue operations before enabling optional modes.
2. **Representative screens:** station board using ordinary/default-station data, one list/detail pair, vertical form and sticky-action form, billing upgrade and MFA. Validate mobile/keyboard/tablet/desktop and both themes before scaling migration.
3. **Administration configuration:** basic onboarding, stations/assignments, workflow drafts/editor and reused resource drafts; server capability checks; validated immutable publication and explicit service mapping. Drafts do not activate runtime.
4. **Sequential workflow pilot:** transactional journey/stage admission, readiness, recovery, cancellation, snapshots/events and booking completion compatibility.
5. **Resource pilot:** shared reservation/session ledger, demand/duration binding, protected ordering, explicit release and extension checks. Combined activation waits for workflow and resource acceptance.
6. **Remaining sections and retirement:** migrate remaining business screens, verify compatibility links and dependent channels, then remove old dashboard code/styles after callers are gone.

## Validation required during implementation

Cover owner/admin/staff, required-MFA state, expired workflow entitlement, resource pilot on/off, one/multiple permitted stations and tenant/location switching. Test browser back, deep links, checkout/OAuth returns and query-cache/socket scope. Exercise dark/light modes, system preference and explicit persistence, unsaved changes, loading/error/empty states and accessible dialogs. Keep customer/public/Mantine pages visually and functionally stable while styles coexist. Ordinary queue regression and operational concurrency tests belong to backend interfaces, not just screenshot checks.

This inventory is source inspection and planning evidence. It does not establish installed shadcn/React Flow, a migrated route, a database change, successful runtime tests or deployment.

## Live Queue implementation update (13 October 2026)

The existing vendor route and API handlers remain canonical. Presentation now composes `vendor/LiveQueueWidgets.tsx`, `vendor/WalkInDialog.tsx`, `vendor/QueueLifecycleTray.tsx`, `vendor/TaskDialog.tsx` and the scoped primitives. The vendor-only ticket scanner and operational board scanner use the shared task dialog; Administration board settings retain their current implementation. Retired the unused legacy VendorQueueLifecycleTray after migrating its consumer and tests. Multi-counter presentation consumes calledTickets/counterDispatch; resource allocation and workflow journey consumers remain gated by their missing operational contracts.

### Operations list implementation

The Bookings/Clients/History slice reuses existing dashboard handlers and scoped Query observers while migrating their presentation through `vendor/OperationsUi.tsx`, `BookingTableRow.tsx`, `BookingCheckInNotice.tsx` and shared `TaskDialog`. `vendor/operationsState.ts` preserves a reschedule selection only when the latest server slots still admit it. Existing `/dashboard/bookings`, `/dashboard/clients` and `/dashboard/history` URLs remain canonical. No endpoint/schema/package changes are introduced. See the progress record for local evidence and remaining acceptance.


### Locations/Resources/Counters local review checkpoint (13 October 2026)

All three current Locations tabs and their list/card/edit flows now use scoped configuration fields, Base UI tabs/combobox and the shared TaskDialog. Retain `/dashboard/tenants`, the existing API and role/limit rules; no workflow/station/resource activation or duplicate resource editor. Keep the shared legacy theme editor until its Settings/Board migration. Location profile/hours writes retain the first server-created target for safe hours retry. Counter/resource conflicts retain edited inputs; resource version/capacity are configuration, not runtime availability. See progress notes for 188-test and synthetic browser evidence; local visual, authenticated mutation, upload/device and deployment acceptance remain separate.

### Services and Availability implementation

`/dashboard/services` retains its catalog/weekly/date-exception tabs. Its list and task editors reuse ConfigurationUi, FieldGroup/FieldSet, TaskDialog and scoped tabs; existing catalog client/handlers remain canonical. `serviceConfigurationState.ts` checks editable quantity feasibility and builds the explicit whole-day exception payload. No booking allocation, workflow, station or API/schema activation is introduced. Follow the [work tracker](vendor-dashboard-rework-ticket-tracker.md); Carlo's local approval gates the next screens.

### VD-08 local Account migration

Existing Account routes and membership gates are retained. Profile/Security/Subscription/Billing now use scoped configuration tabs and forms; shared contact, Email OTP and deletion handlers adopt vendor controls through `AccountPresentation`/`AccountFields`, retaining customer fallback. Plan selection and capacity/paid-exit dialogs retain API bodies, confirmation tokens/revisions and checkout behavior. Server billing failures are blocked read states with retry; capability-disabled capacity remains hidden. Legacy customer presentations remain intentional consumers. Phone removal is unsupported by the current API and is an explicit acceptance gap rather than a fabricated UI control.

### VD-09 local Reports/Ratings migration

Reports now consumes scoped snapshot metrics and capability-gated period usage with loading/error/retry/unknown states. `vendor/reportState.ts` owns the actual recorded interval transformation. Unused legacy MetricCard/stat/chart presentation retired after its consumers migrated. Ratings uses scoped vendor primitives, actor/business/page query identity and guarded exact visibility writes. Existing backend endpoints, moderation/aggregate policy and staff navigation remain unchanged.

### VD-10 vendor registration/onboarding local migration

`/register/vendor` now uses VendorAuthLayout, scoped native fields/actions, configured provider controls and ref-compatible form primitives. Both signup and authenticated completion remain on the same routes/endpoints/identity; shared `/login`, customer registration and callbacks are still pending/unchanged. useVendorTheme centralizes existing dashboard/auth preference behavior; VendorPortal prevents category dropdowns escaping auth theme scope. No provider or registration policy was forked.

### VD-10 Login local migration

Dashboard-return Login/reset/MFA now uses scoped vendor fields/actions and branded desktop composition. Plain/customer Login keeps Mantine/card/PIN defaults. Existing handler bodies and provider/identity policies remain shared; vendor reset retains the approved return target. Callback presentation and shared notification consumers remain pending inventory. Local-only verification is recorded in progress; no publication/deployment claim.

VD-10 callback now locally uses vendor composition for existing dashboard targets and retains customer fallback; existing refresh/session and success destinations stay shared. Provider-error retry retains vendor context. Hash/task change cancels stale UI/navigation completion. Global toast and operational alert presentation remains pending.

VD-10 operational queue/booking alerts are now native scoped panels with bounded scrolling and original callbacks/state. Removed only the redundant outer portal; each task dialog still owns its portal. Global transient toasts remain pending.

VD-10 transient feedback is locally migrated to a scoped Base UI provider/viewport with a shared vendor queue; customer fallback remains unchanged. FIFO display/timing/duplicate behavior is preserved. Account deletion receipt remains a deliberate global lifetime exception because it survives session closure. Legacy presentation retirement must retain that receipt evidence until a replacement spans logout.
