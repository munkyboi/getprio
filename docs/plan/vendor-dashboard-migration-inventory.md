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

`/dashboard/services` retains its catalog/weekly/date-exception tabs. Its list and task editors reuse ConfigurationUi, FieldGroup/FieldSet, TaskDialog and scoped tabs; existing catalog client/handlers remain canonical. `serviceConfigurationState.ts` checks editable quantity feasibility and builds the explicit whole-day exception payload. No booking allocation, workflow, station or API/schema activation is introduced. Follow the [work tracker](vendor-dashboard-rework-ticket-tracker.md); Carlo authorized end-to-end continuation across screens; publication, deployment and runtime activation still require their respective authorization and evidence.

### VD-08 local Account migration

Existing Account routes and membership gates are retained. Profile/Security/Subscription/Billing now use scoped configuration tabs and forms; shared contact, Email OTP and deletion handlers adopt vendor controls through `AccountPresentation`/`AccountFields`, retaining customer fallback. Plan selection and capacity/paid-exit dialogs retain API bodies, confirmation tokens/revisions and checkout behavior. Server billing failures are blocked read states with retry; capability-disabled capacity remains hidden. Legacy customer presentations remain intentional consumers. Phone removal is unsupported by the current API and is an explicit acceptance gap rather than a fabricated UI control.

### VD-09 local Reports/Ratings migration

Reports now consumes scoped snapshot metrics and capability-gated period usage with loading/error/retry/unknown states. `vendor/reportState.ts` owns the actual recorded interval transformation. Unused legacy MetricCard/stat/chart presentation retired after its consumers migrated. Ratings uses scoped vendor primitives, actor/business/page query identity and guarded exact visibility writes. Existing backend endpoints, moderation/aggregate policy and staff navigation remain unchanged.

### VD-10 vendor registration/onboarding local migration

`/register/vendor` now uses VendorAuthLayout, scoped native fields/actions, configured provider controls and ref-compatible form primitives. Both signup and authenticated completion remain on the same routes/endpoints/identity; vendor-return Login and callbacks are now locally migrated as recorded below; customer registration remains unchanged. useVendorTheme centralizes existing dashboard/auth preference behavior; VendorPortal prevents category dropdowns escaping auth theme scope. No provider or registration policy was forked.

### VD-10 Login local migration

Dashboard-return Login/reset/MFA now uses scoped vendor fields/actions and branded desktop composition. Plain/customer Login keeps Mantine/card/PIN defaults. Existing handler bodies and provider/identity policies remain shared; vendor reset retains the approved return target. Callback and shared notification migrations are recorded below. Local-only verification is recorded in progress; no publication/deployment claim.

VD-10 callback now locally uses vendor composition for existing dashboard targets and retains customer fallback; existing refresh/session and success destinations stay shared. Provider-error retry retains vendor context. Hash/task change cancels stale UI/navigation completion. Operational alert and transient toast migrations are recorded below.

VD-10 operational queue/booking alerts are now native scoped panels with bounded scrolling and original callbacks/state. Removed only the redundant outer portal; each task dialog still owns its portal. The transient toast migration is recorded below.

VD-10 transient feedback is locally migrated to a scoped Base UI provider/viewport with a shared vendor queue; customer fallback remains unchanged. FIFO display/timing/duplicate behavior is preserved. Account deletion receipt remains a deliberate global lifetime exception because it survives session closure. Legacy presentation retirement must retain that receipt evidence until a replacement spans logout.

### VD-12 first retirement inventory (14 October)

| Consumer | Decision | Evidence / acceptance boundary |
| --- | --- | --- |
| Legacy dashboard-notification-stack/dashboard-notification styles | Removed four unused rules | No remaining frontend source callers after native operational alert migration; native alerts keep scoped styles. |
| Old neura-sidebar selectors | Removed seven dedicated rules | Exact search found zero non-stylesheet frontend callers; dedicated base/hover/mobile blocks removed. Remaining shell/drawer/navigation rules were subsequently inventoried separately below. |
| finazze-auth-card/customer auth defaults | Retain | Plain/customer Login, callback, registration and shared Account defaults still use this presentation. |
| Global account-deletion receipt notification | Retain lifetime exception | Persistent request reference must survive logout; ordinary vendor toast provider unmounts with the dashboard. |
| Secure/public queue-board presentation | Retain | Board intentionally keeps prior UI/UX and does not inherit the authenticated shell. |

Retirement and local fixtures do not close authenticated/provider/device, deployed or simultaneous-resource acceptance. VD11 remains fail-closed pending authoritative contracts/readiness/pilot evidence.

VD12 shell retirement follow-up: removed32 dedicated legacy neura shell/mobile-header/brand/logo/drawer/navigation/main/header/tenant-selector rules after exact zero-caller inspection across frontend source. Grouped drawer selectors contain only retired targets. Account/activation cards, plan buttons, live scanner, public board and customer styles remain because they still have consumers. No behavior, route or runtime gate changes.

VD12 access-state migration: WorkspaceAccessState now owns native loading, subscription activation and missing-workspace presentation. VendorAuthLayout supplies theme scope before the normal workspace shell is available. Existing guard order, subscription decision, View plans callback, recovery destinations and logout remain canonical. Four obsolete activation/no-tenant/badge style rules were retired after their last callers migrated; remaining active legacy card/button consumers are retained.

### 15 October 2026 — deployed presentation inventory

Services/Availability, Staff, Settings/Queue Board, Account/billing/security and Reports/Ratings native consumers in #446 are deployed at 60234ed441810d8bbd8ed169415abbf203ec50aa (run 38660293410, paired API #447 included). Authenticated read-only page loading and native Account responsive checks passed; frontend asset index-BD0sBgV3.js confirms the new presentation. Existing public/customer presentation and API business contracts remain shared. No simultaneous pooled-service runtime consumer or activation is claimed. See the progress log for exact live evidence and outstanding provider/device acceptance.

### Linear multi-service consumer boundary (2026-10-17)

Local-demo QueueDraftsPanel and QueuePublishedPanel consume the shared v2 plan union through queuePlansV2. Legacy scalar resource cards and waiting actions exclude active v2 IDs; backend owner enforces USE_QUEUE_PLAN_COMMAND for legacy mutations. No general production consumer migration or Multi-station completion is implied. See vendor-multiservice-461-acceptance.md.

### Named court and nested extra consumer target (2026-10-17)

The flat queuePlanV2 consumer is historical Linear coverage and must be adapted to the reviewed named selection hierarchy. New local namedQueueSelectionDraft and NamedQueueSelectionSummary are unbound presentation/editor preparation only. No resource member IDs or child allocation commands are invented from catalog names. The authoritative shared DTO/runtime migration remains API/Queue-owned; existing fixture/catalog records and preview are preserved.

### V3 local consumer bound and verified (2026-10-17)

queueSelectionsV3 now consumes Queue's exact shared options, mixed-version lists, draft/publication, active/review projection and child commands. NamedQueuePanel/Dialog/Operations are loopback-demo gated. The historical flat component remains mounted so existing edits/data are preserved, with new flat intake/publication disabled there and discriminator filtering. V3 child IDs/revisions/allocation groups remain server-issued; review URLs reload actual persisted requests. Named snapshot/registry/quote policy is not guessed from booking or current catalog. Corrected Opera evidence is separate from v2 history.

### V4 unified intake and policy administration

New capability-gated walk-in intake now uses New service request with explicit count-based v4 inputs and root-only single/multiple presentation. Historical v3 editing/review stays versioned. Services administration adds Queue policy GET/PUT editing; configuration and old published snapshots remain separate. See vendor-v4-configurable-intake-acceptance.md for actual Opera lifecycle evidence and outstanding restoration/responsive checks. The proposed V5 extra-wrapper/resource extension was cancelled before any Vendor implementation or schema change; approved pooled leaf extras remain.

The V4 restoration gate above is now cleared: exact service2 values restored at revision4, same-key replay confirmed one receipt, fresh GET and actual new intake verified default2×30=60. Opera review375/768/1440 and short375×500 checks passed with no horizontal overflow; original theme/viewport/interception restored. Full acceptance/gaps remain in the V4 acceptance document.

Queue policy chooser migrated to the approved shared service-status grid with Active default, search/reset/paging and icon editing. Existing policy editor remains, configuration state is separate from catalog active status, and no new backend activation field/behavior exists. Actual acceptance: vendor-queue-policy-grid-acceptance.md.

Queue policy editor fields now use General/Duration/Resources/Extras sections with shared accessible tabs. API body/version/permission/revision/replay contracts unchanged; hidden-section validation and draft retention verified. No backend migration. See vendor-queue-policy-tabs-acceptance.md.


### Pool lifecycle and named-resource local milestone — 2026-10-17

See [acceptance evidence](vendor-pool-lifecycle-acceptance.md). Disposable unused deletion and exact replay, referenced archive/read-only registry, and four existing Court aliases passed Opera checks. Capacity remains four. Queue-owned identity/hold verification and Called protection recovery remain pending. Aggregate remains unpublished and requires review approval.


Pool recovery final verification: VD015 Served with zero holds; independent replay/history checks passed. Manual request refresh now refreshes selected detail as well as lists, with cancellable reads. Opera GET 200/terminal-state refresh and two focused checks passed. Responsive/light and future-stage blocked archive browser acceptance remain open. See vendor-pool-lifecycle-acceptance.md.


### Shadcn request and policy form layout — 2026-10-17

See [form layout acceptance](vendor-shadcn-form-layout-acceptance.md). Existing state/IDs/V4 policy contracts retained; semantic grouped forms, InputGroup duration, associated inline errors and inactive mounted panel hiding verified in Opera. Local full298 tests and validation pass. Aggregate visual approval and physical/AT acceptance remain separate; no publication.


Named resource temporary maintenance toggle and independent archival are implemented locally. Active must retain both enabled and inactive nonarchived cards; Archived uses explicit archivedAt only. Queue migration/runtime and actual Opera OFF-in-Active/ON/explicit-Archive acceptance passed. Queue independently verified exact replay/history and zero holds; owned fixture cleanup is coordinated. Frontend 302 tests/type/lint/build pass; physical/AT and aggregate approval remain separate. See vendor-named-resource-toggle-acceptance.md; no user Court restoration or publication.


### Resource pool information and group spacing — 2026-10-17

See [layout acceptance](vendor-resource-pool-info-layout-acceptance.md). Referenced-deletion reasons moved into a full-text accessible information tooltip beside Configured; authoritative confirmations/errors remain. Added shared Separator and spacing between pool and service-requirement groups. Actual Opera desktop/375px hover/focus/click/touch-emulation checks passed; no data writes or publication.


### 2026-10-17 — Service request vertical stepper

Local Studio Stepper 9 composition now organizes Customer details, Services & resources and Review; draft save, final publish validation, mounted nested identities and safe recovery controls are preserved. Actual Opera responsive/keyboard/incomplete draft save-reload and independent Queue preservation evidence: [acceptance](vendor-request-stepper-acceptance.md). Aggregate approval and publication remain separate.


2026-10-17 Services action refinement: populated Add service in group header; empty full-width Add; Plus/Trash icons; row-header Remove; unique Choose service labels and removal focus. Actual Opera desktop/375 evidence and no-write verification in [stepper acceptance](vendor-request-stepper-acceptance.md#services-headeraction-refinement--2026-10-17).


2026-10-17 shared form grouping rule: authoritative UI rules section 6 now defines outlined semantic fieldsets, backed by shared FieldSet/FieldLegend styling and deliberate request/policy adoption. [Acceptance and exact files](vendor-shared-fieldset-acceptance.md) include actual Opera desktop/375px, keyboard and theme checks; no data writes.


2026-10-17 semantic inline alert rule: reusable info/success/warning/error mild tints, destructive compatibility, central light/dark tokens and preserved announcement overrides. Current service-count info applied; no badge-fill change. [Acceptance/source/tests/screenshots](vendor-semantic-alert-acceptance.md), no business writes or publication.


2026-10-17 resource/extra fieldset batch: icon-only top-right removal with tooltips/parent focus, Plus Add extra, conditional fixed quantities, outlined extra groups and valid duration emphasis. [Acceptance and evidence](vendor-resource-extra-form-refinement-acceptance.md), no successful business writes; fixed-policy Opera fixture gap explicit.


2026-10-17 root groups + sticky rail: outlined Service N with icon-only removal and desktop sticky rail verified;375px normal flow/touch/removal focus checked, no successful writes. [Acceptance](vendor-root-service-sticky-acceptance.md). Named-extra multiple chooser foundation is prepared but UNWIRED; Queue/API tested contract/runtime and dynamic interval availability handoff remain pending, not accepted as complete.


2026-10-17 root service Accordion replaces the earlier root fieldset presentation: Studio03/09 left-chevron rounded cards, independent inline44px removal, multiple open/new auto-open, mounted hidden controls and stable values. Opera verified keyboard collapse, independent removal/focus return and invalid-duration publication validation reopening/focusing the input;375px wrapping/44px targets and1024x500 bounded dialog/static rail checked.313 frontend tests,typecheck,focused lint andbuild12.35s pass. Light-theme final screenshot remains pending after Opera extension popup interruption. Named-extra chooser remains UNWIRED; Queue/API now supplied tested runtime/shared contract and released own services11/12 after HTTP lifecycle checks. Backend evidence is owner-reported, distinct from pending Vendor browser acceptance. No commit/publication/deployment.


2026-10-17 named-extra integration: exact Queue-owned shared V4 copied unchanged; gated flat member-ID transport/reload, multiple searchable chooser, quantity cap/exact validation, retained names on downsize, member-removal customer agreement, whole-tree interval API/debounce/abort/context guards/15sec/events/RetryAfter, and frozen per-member outcome/parent-dependency consumers implemented locally. Queue source contract pass found and closed the selected parent maintenance/archive name issue. Opera verified search/keyboard,2/2 cap(third disabled),2/1 retention through draftsave/reload,375px no overflow/44px chip removals, dynamic protected reasons without dropping names, and publicationWaiting with3children/zeroownholds independently checked by Queue. Dedicated QA draft7fc32db5-b553-4536-9754-f188ed2132be/VD018/ticket26 only; no user resources changed. Browser Call honored occupied-counter then queue-priority gates; those do NOT prove resourceWait rejection. After Queue normally served its own competingVD017, VD018Called with3protected/0allocations (independent collection). Own-preview/Start/independent member releases and final runtime matrix still pending; unknown/stale response interaction remains unaccepted. No PR/commit/push/production changes.


2026-10-17 final named-extra lifecycle: dedicated browserVD018/ticket26 Served after normalCall/Start and independent TrainerA/TrainerB/parent completion. Queue independently captured3simultaneousnamedallocations, eachseparaterelease, exactly1parentStart/Complete and0finalglobalholds/allocations; all19 prior drafts/24priorplans/182priorreceipts unchanged against its pre-browser baseline. Ordinary browserpreview confirmed serverexcludedOwnProtection:true whileCalled. [Detailed runtime matrix](vendor-named-extra-runtime-acceptance.md). Resource groups now nested Accordions (extras remain outlined), both ancestors autoexpand for validation;24focusedtests/318fulltests,typecheck andbuild13.85s pass. Resource nested browser/focus/mobile outcome-wrap and unknown/stale fault checks remain pending due an actual Opera extension/control interruption during user activity. No blanket acceptance, no commit/PR/push. QA11/12 fixtures remain active with zero holds for aggregate preview review; cleanup hold coordinated.


2026-10-17 final local acceptance update:321frontend tests/typecheck pass, all-frontend lint0errors(3warnings in unchanged files), build12.38s, sharedV4 exactcmp/diffcheck pass. Opera nestedResource collapse/reopen/stableIDs/chips/newautoopen/removal focus and invalidPublish two-ancestor expansion+fieldfocus passed; no publish network issuance from inertvalidationdraft15c59d7e. Failedpreview retainedselectedA/blockedB,C; superseded durationrequest aborted and could not enable choices, latestnormalrequest restored choices. Fixed discovered short-viewport focus clipping via scoped TaskDialog focus/resize correction;375x500,alreadyfocused375x400shrink,1024x500 fullfield bounds verified abovefooter. Light/dark375 popup/layout passed; outcome geometry separately replayed Queue's recordedVD016Start DTO inertly(no newticket). [Final matrix](vendor-named-extra-runtime-acceptance.md). Allowninvalideditsdiscarded; validinertpreview retained, userforms untouched, QA11/12cleanuphold active. No PR/commit/push/schedules/production. PhysicalAT/device/billing/live acceptance and oldrequestcleanup scope remain separately open; fullrework not markedcomplete.


2026-10-17 cleanup coordination: Carlo authorized removing old unpublished drafts except his current request. Queue owns backup/archive/transactional cleanup; Vendor performed read-only Opera identity checks only. Former Stepper form tab is closed; both remaining local queue tabs currently have no request dialog, and their URL request IDs are published review records rather than current draft sources. The saved Mark card is now revision3 (earlier baseline2), so recent user edits are explicitly protected pending exact keep-selection confirmation in Central. Stepper9c4a147b, published Alejandro27, fresh QA preview15c59d7e and all published history remain protected. No deletion/hiding or independent cleanup occurred. After authorized Queue cleanup, refresh only the owned list/preview; do not navigate away from or overwrite user edits.


2026-10-17 cleanup clarification: Carlo chose to retain NONE of the saved unpublished drafts, superseding the earlier draft-only protection hold. Queue is authorized for exactly4fdaeb2c-95dd-4661-bf25-ec80633ed53e,31413b5c-39c6-4035-97ae-d8621d3bcf84,9c4a147b-74f5-43bb-b01d-8865770f3385 and15c59d7e-7afd-4e26-9d70-8683f372402c after fresh backup/archive and locked state/revision checks. Vendor freshly confirmed both local queue tabs have no open request dialogs/forms, with no new request tab, without editing/navigating/refreshing user forms. Published Alejandro/all history and command receipts remain protected; new/unknown drafts are excluded. Transaction completion is not yet claimed; only the owned preview list will be refreshed afterward.


2026-10-17 cleanup COMPLETE at18:48:49 Manila: Queue committed deletion of exactly the4approved unpublished drafts after fresh backup, full-row/fsynced archive and locked state/revision checks. Zero unpublished drafts remain.8required draft-only FK audit rows were archived before removal; all202command receipts, including8target receipts, remain byte-for-byte preserved. All27tickets/19published request records and history/resources/configuration hashes remained unchanged; published Alejandro27 preserved. The earlier keep-preview hold is superseded for the unpublished QA validation draft15c59d7e only; its evidence remains historical and it is no longer an available saved preview. QA11/12 services/pools remain active under review hold. Vendor refreshed ONLY owned queue tab5624 after confirming no open dialog; saved draft list text is empty, New service request enabled, and publishedVD018review visible. User queue5573/Services5598 were not refreshed or navigated. Screenshot: vendor-after-unpublished-cleanup.png in the existing visualization directory. No independent deletion, PR, commit, push or deployment.


2026-10-17 READ-ONLY diagnosis — open global-control integration gap: Serving from remains an enabled counter selector. Top Call next/Start service/Skip current use legacy ticket mutation routes and are blanket-disabled by any active V2/V3/V4 plan ID in the location, not only the selected counter. The per-request plan actions remain authoritative; during inspection AlejandroVD019 was Called with an allowed per-request Start action, while global Start was disabled. Add walk-in already delegates to the new request intake in the local plan mode. Backend rejects legacy mutations for plan-backed tickets with USE_QUEUE_PLAN_COMMAND. No ticket action was issued during diagnosis. Recommendation sent to Central, pending scope decision: select current/next plan by counter and reuse revision/group-safe plan commands; do not remove the guard or silently reinterpret Cancel protection as Skip. There is no V4 Skip contract. Earlier Called/expiry details are time-specific observations, not frozen eligibility. No broad rewrite started; this remains an open acceptance item for unified queue controls.

## Counter toolbar recovery integration — 2026-10-17

Local selected-counter plan-aware toolbar, shared pending command owner and explicit skipped-request Recall implemented against Queue’s reviewed contract. Source checks and first read-only Opera context are recorded in [counter-controls acceptance](vendor-counter-controls-acceptance.md). Dedicated isolated QA branch lifecycle/mobile/race acceptance remains open; do not claim full completion or publish this aggregate. User requests/forms remain protected.

Counter-controls follow-up: direct isolated Opera Call/Skip/Recall/Call/Start + three independent releases accepted; Queue independently verified original priority/allowance/history and Alejandro unchanged. 375px light/dark and delayed counter-read cancellation checked. Browser ambiguous-write/race injection, physical/AT and aggregate review remain explicit gaps; see counter-controls acceptance.

Request review scope fix: reproduced stale request ID crossing branches (wrong-scope404/correct-scope200); context changes now clear selection after the unsaved-change guard, new links bind an authorized branch, and real refresh failures retain Retry with cached actions disabled. Actual Opera Retry200/no reload verified;327 tests/typecheck/focused lint passed. See [request-review scope acceptance](vendor-request-review-scope-acceptance.md). No user commands or backend restart.

Published request service disclosure: shared multiple-open root service accordions, explicit collapsed counts/action affordances, persistent external waiting alerts/request buttons, and scoped request/service/resource/extra/metadata hierarchy. Actual read-only Opera desktop375 light/dark, keyboard/value preservation and completed named-member history verified;10 focused tests/typecheck/lint passed. See [published-service review acceptance](vendor-published-service-review-acceptance.md). No ticket commands or publication.


Saved draft actions locally accepted (2026-10-17): server-gated Publish/Edit/Delete, named confirmation, exact-command recovery including malformed success, and selection/unsaved-form protection implemented. Actual Opera create→Publish→reload and Delete Cancel→lost-response retry→reload passed at375px; own ticket30 completed normally and all unused own drafts discarded. Queue independently verified audit/receipt/resource preservation. All340 frontend tests, typecheck, focused lint and build passed. Local allowance flag was off; no browser charging claim. See [saved draft actions acceptance](vendor-saved-draft-actions-acceptance.md). Aggregate approval, physical/AT and production evidence remain open; schedules paused, no publication.


Expandable named service request transaction table (2026-10-18): Base Table/Progress, row disclosure, loaded-record search/status/sort/pagination and horizontal separators implemented. Server-anchored per-child elapsed/OVERDUE respects explicit release, pause semantics, exact named members and shared visibility timer; no average request duration or automatic release. Actual Opera own28/30 history, live read-only ticking, keyboard and375/768 responsive checks plus command-disabled overdue replay accepted. All346 tests/typecheck/focused lint/build passed. See [request table acceptance](vendor-request-table-acceptance.md) for reference mismatch, replay limits and remaining hidden-tab/multi-page/physical/aggregate gates. No PR; schedules paused.

### Historical extras compatibility reconciliation — 2026-10-20

`NamedQueuePlanDialog.updateDurationCount`: removed implicit child extras deletion; retained historical selection/member identities and independent durations. `QueueSelectionFieldsV4.selectionInputV4` still serializes retained children under existing validation; `queueNamedAvailability` includes supplied extras, while `namedExtraExecutions` projects historical outcomes. None is automatically obsolete under the intended resource-only NEW-intake direction. API/Queue/Vendor concur: await explicit server capability/validation before relying on resource-only admission; preserve historical V2/V3/V4 lifecycle/receipts/allocations and legacy draft/amend compatibility. Callback/serializer regressions pass; actual server saved-draft reopen/replay pending QA. No schema conversion or compatibility-code deletion.

### Recovery/public access presentation slice — 2026-10-20

`VendorDashboardPage` now composes the public entry card and unchanged QueueBoardScanner as sibling cards in a container-responsive grid. Current legacy waiting presentation stays available only in its existing legacy path. The carried-over/missed views now compose `QueueRecoveryTable` using the approved Service requests surfaces and shared Table/Input/Select/ToggleGroup/Button primitives. No source/API migration: carry-over data remains snapshot.overflow; missed data remains the existing loaded recovery selection; Restore handler/guards stay page-owned; skipped-plan Recall stays separate. Raw internal IDs are retained only as React identities, not primary row labels. Loaded-only search/sort/pagination do not imply server totals. Developer12tests/typecheck/diff check pass; rendered375/768/1440/keyboard/empty+populated verification pending QA versioned handoff. Frozen QA source/runtime remains unchanged.

### R3 final presentation/security evidence reconciliation — 2026-10-20

No additional product migration or runtime change. Current scoped QA PASS: actual main-route5197 public cards/disclosures390/768/1440 (390 accepted mobile), plus desktop empty recovery; R3 synthetic actual frozen component/styles presentation with corrected production wrapper context. Workspace/main computed foreground250,250,250/background9,9,11, and true375/768/1440 dark recaptures show readable headings/labels/notices/ticket identities/controls/data. Harness9tests/build/typecheck PASS reported.

R2 functional/security/light PASS stands:23carry-over rows10/10/3, Missed10loaded cap/disabled Next, searchQM010→1, newest sort, empty table, local mock Restore Escape/focus return;403private/source/dependencies/traversal,404unknown/no fallback,200root/assets/hash/MIME,405HEAD/POST. This remains synthetic presentation/security evidence, not real recovery/Restore/Recall/idempotency outcome proof. Preserve R1 security FAIL and R2 dark FAIL as historical, superseded only by bounded R2 static-serving and R3 wrapper-only fixes respectively; actual product component/styles unchanged.

Final R3 artifact folder `/Users/carloabella/.codex/local-test-harnesses/vendor-recovery-synthetic-20261020T2250`: `qa-r3-1440x900-dark.png` (actual1440×900), `qa-r3-768x1024-dark.png`, `qa-r3-375x844-dark.png`; review manifest `5300a23021c919525a08bd5e8b6f6c1434fc44da2fdf26a2698cfe4e275d8334`, public manifest `b59991d28aa77a566af7f14401820c311224aaf7112e9359c6c610d9807d6154`, Main `7f119bcaa3043ed933d25bee018d528746702c91f0d64b78ebe9a3d4c484ff52`.5207 QA-owned/running; original5197/API/DB/proxy unchanged. Full rework remains incomplete.

## New Dashboard migration entry — 20 October 2026

`/dashboard/overview`: new independent `ResourceDashboard`/model/read hook, not a duplicate legacy dashboard monolith. Operations nav precedes Live queue; staff/basicDashboard access uses existing role/entitlement guards and API queue.read enforcement. API-agreed local observations supply current-date waiting count, distinct requests using resources, loaded state bars and per-pool accounting. Pool-detail Sheet and conditional attention use existing vendor primitives/theme portal. Additive pool quality contract is synchronized with the backend owner; missing older-runtime quality remains unknown.

Status: source implemented for selected A + B drilldown + C attention. Focused accounting, foreign-scope, quality, stale/presentation and stream reconnect/disposal regressions plus frontend static/build/full-suite logs accompany the handoff. QA-owned bounded rendered responsive/light/dark/keyboard and authenticated integration acceptance is recorded below with explicit limits; this entry is not merge/deployment/live acceptance. Lifecycle actions, resource runtime readiness, production activation and historical endpoints remain unchanged.

## Dashboard bounded runtime acceptance and display handoff — 21 October 2026

Head accepted the bounded Dashboard evidence with no behavioral FAIL. The verified report is `/Users/carloabella/.codex/local-test-harnesses/vendor-dashboard-review-20261020T231536/causality-harness-v2/output/playwright/QA-EXECUTION-REPORT.json`, SHA-256 `d76d5b7031b3e7353113511ab4e9e1793d947efaeee375a4137448c56888a225`. Twelve numeric script cases and ten actual Dashboard SSE → own GET → visible-value cases passed (58–137 ms), covering publication, Call, Start, Complete, Interrupt and hold release. Assigned staff GET/SSE passed; unassigned/revoked access returned 403 and old streams closed. Head reviewed the images. All QA-owned browser sessions, test API/frontend and disposable DB services stopped; original/preserved services were untouched.

Coverage is bounded: first-publication UI causality remains untested (two other publication cases passed); configuration event/own-GET revision/capacity and visible UI change passed, but strict DOM latency was not captured. A pure queue.read-without-operate role cannot be represented by current product roles; normal assigned staff performed only GET/SSE, without permission overrides. The tested visual matrix was 1440 light/dark, 390 light, plus 768 light and 390 dark lower-page/Sheet checks; no horizontal overflow and Sheet focus/return passed in those checks. Long overflowing Sheet scroll stress and the full all-theme/all-breakpoint matrix remain untested. This is not unrestricted/full-matrix acceptance.

Final API/Head semantic correction: headline **Waiting now**, caption **Excludes bookings scheduled for later.** The legacy `readyWaitingCount`/frontend `readyToCall` names remain for compatibility. Their value is all waiting requests for the current queue date excluding future bookings, not resource availability, valid plans, READY stages/counters, or next eligibility. Eligibility stays in Live queue. Earlier call-ready interpretation was incorrect; previously measured numeric deltas remain valid. The v3 display-only correction also formats singular/plural units in pool values and Sheet details. No runtime logic or API expansion is introduced.

Source provenance: independent source review passed frozen v2 (22 verified files); v1 functional suite 395/395 and typecheck passed, and v2's sole CSS full-span correction built successfully. The versioned v3 packet records focused existing Dashboard/presentation tests, typecheck/build and exact changed-file hashes/delta; no full functional or command-runtime rerun is claimed for this display/comment/documentation-only follow-up. Hook, backend, accounting logic and frozen functional behavior remain unchanged. Existing focused Dashboard/presentation tests passed 13/13; frontend typecheck passed; v3 production build passed in 19.62 seconds with the existing Chart/Tailwind selector and chunk-size advisories.

Separate blocker: the normal migration runner's lexical dependency ordering bug remains unresolved. The test-only dependency-ordered bootstrap succeeded; that does not establish production migration readiness. Original main preview was subsequently refreshed by primary after independent v3 review: reviewed API source verified, API5007 restarted as PID46339 with the same private fixture and guarded launcher; frontend5187 remained PID70155 and returned HTTP200. Authenticated assigned-staff VD Sports Club / Demo Courts Dashboard showed Waiting now 0, requests using resources 3, pool usage Courts4/4, Basic Equipments14/20, Trainers3/4, and Trainers detail '1 unit' available. All15 business-table counts and complete row digests matched before/after, including the tickets present at that earlier Dashboard-only checkpoint; this is not the duration-delivery baseline. Read-only preview checks performed no lifecycle/configuration commands, migrations or reseed. Evidence: original-preview-before.json, original-preview-after.json, original-preview-verification.json and original-preview-v3-dashboard.png in the durable review packet. No commit, push, merge, deployment or production activation occurred.

## Store-hours-aware request duration — source handoff, 21 October 2026

The new V4 service-request duration control shows the server-selected closing time and a provisional maximum fitting duration. It uses the approved `serviceHoursWindow` on selection-options (`status`, DB-clock `observedAt`, timezone, open/close instants, remaining whole minutes, provisional marker). Dynamic hours metadata does not change `catalogRevision`. A client-only monotonic timestamp captured at request start conservatively includes network latency; the countdown uses server instants plus elapsed time, never browser weekdays, local wall-clock scheduling, adjacent-window merging or queue extensions.

This is an **earliest-start-now limit**, not promised queue start, admission or resource availability. Exact finish at closing fits; elapsed time can make the same count too long. Linear resources run in parallel (maximum duration); ordered stages use the sum of each selected stage's maximum root-resource duration. Quantities do not multiply time; contained extras add no time. Top-level transported direct-resource rows are canonical roots mapped by their own service ID; nested extras inherit their root stage. Missing/duplicate stage mappings are unavailable, not guessed.

All affected selected duration policies are intersected, including min-based steps and fixed defaults. The shared numeric field and buttons preserve invalid typed strings and child selection identities; no silent truncation, extra deletion or first-resource policy clamp. Closed, unknown, policy-incompatible or minimum-no-fit states explain the publication block while draft Save remains available. Focus/visibility/online/scoped queue hints and the existing foreground refresh update open forms without resetting drafts. The amend form shares count-control consistency without client-side new-intake hours gating; server-side amendments of newly tagged requests still revalidate current hours, while historical untagged amendments retain existing behavior. Legacy V3 publication and active/history records are unchanged.

Full source and the latest six documents were snapshotted before edits at `/Users/carloabella/Backups/GetPrio/vendor-duration-hours/2026-10-21T00-49-18+0800` (1601 source entries; source manifest `c3c8e78f0ba98a460aa28b876a5f2f855d667bad97e6fa3badca9d321c7abd12`). Focused duration/preservation/refresh tests passed 34/34; final frontend typecheck/build logs and exact source hashes accompany the versioned packet. Dashboard v3 implementation is preserved. At this source-handoff checkpoint, independent focused source review and a bounded isolated runtime pass were pending; the final bounded QA and local-delivery evidence below now supersedes that pending status. No runtime acceptance was claimed by the source checkpoint. Server publication remains authoritative, and the backend companion is reviewed separately; this is not production enforcement, migration readiness, deployment or activation evidence.

## Store-hours duration — final bounded QA and local delivery, 21 October 2026

**Status: bounded runtime PASS after frontend v2 layout correction; local preview delivery verified.** This supersedes the duration source-handoff's pending runtime status, while retaining that checkpoint and its pre-edit snapshot/test provenance. Backend v2 and frontend v2 source/runtime packets remain immutable. Source review passed; frontend focused tests were 34/34, typecheck passed, and the v2 build passed in 24.93 seconds. This final update changes documentation only.

Authoritative final QA: `/Users/carloabella/.codex/local-test-harnesses/duration-store-hours-qa-20261021-readonly/runtime/QA-FINAL-REPORT.json`, SHA-256 `24190156f26e9e3ba9d6bfdce9a0cc0dc4a65d93fccfa9e44993e3927f80fecd`. A single fresh isolated fixture used normal owner authentication. A 45-minute count 3 draft was preserved against a roughly 34-minute window; direct Publish rejected with `409 SERVICE_DURATION_EXCEEDS_STORE_HOURS` and fresh window metadata, leaving no published version, hold or allocation. Reopening retained 3; entering 2 showed the correct maximum 2, disabled + and 30-minute total. Natural aging over 35 samples / 34.746 seconds reduced maximum 2→1 while retaining entered 2 and showing the warning, without clock changes, hour writes or manual refresh. A valid 15-minute publication passed; all three duration-bearing marker locations were tagged, while the separate organizational service root was correctly untagged. After shortening only synthetic hours to about 9 minutes remaining, tagged Call rejected with the same 409 and fresh metadata; the ticket stayed waiting with no holds/allocations and one published version.

Frontend v1's 16-pixel input/suffix overlap was resolved by the independently reviewed v2 layout-only change. Actual 1280 desktop and 390 mobile checks showed readable count 2, suffix below, 44-pixel buttons, input widths approximately 224.7 / 202 pixels, focus inside and no horizontal overflow. An open form's explicit Refresh hours changed the helper maximum 30→15 minutes and input maximum 2→1, preserving chosen 2 with warning and disabled +. Final frozen backend 642-file and frontend 457-file fingerprints were unchanged. Only QA-owned API5009, UI5189, DB56790 and browser processes were stopped; fixture files/private evidence were retained and original/preserved services were untouched by QA.

**Coverage limits:** exact closing/1-ms overshoot; split/overnight/24-hour/timezone/DST windows; stage maxima/sums and quantity/extra arithmetic are source/deterministic evidence here, not additional live cases. Tagged Start, Retry, amendment, receipt replay-first behavior, malformed/mixed/unsupported provenance and historical V4 compatibility are reviewed source/focused-test coverage only. The runtime fixture had no selected extras, so extra-identity preservation has source/test coverage, not actual extra-UI runtime proof. Full theme/breakpoint matrix, physical mobile keyboard/device acceptance and old/history/active production commands remain untested. No full-rework completion or production readiness is implied.

Primary's delivery evidence: `/Users/carloabella/.codex/local-test-harnesses/duration-store-hours-review-20261021/LOCAL-DELIVERY-VERIFICATION.json`, SHA-256 `8359f6dea25d72699f9f9b12d5dce66e7d1452f276d46af44ea7683dc35cec44`. Reviewed source union was verified; API5007 ran as PID56057 and UI5187 remained PID70155. Authenticated assigned staff in VD Sports Club / Demo Courts saw closing 3:00 AM, maximum 1 hour, chosen count 1 and disabled +. The unsaved local inspection selection was discarded; no original preview Save, Publish or lifecycle command ran. All **19 business-table complete row digests/counts matched before and after, with 13 tickets before and after**. The earlier Dashboard-only ticket baseline changed before duration source edits and is not the duration-delivery baseline.

The normal migration runner's lexical dependency ordering bug remains unresolved. Successful test-only ordered bootstrap (158 migrations, zero pending in this isolated fixture) does not establish production migration readiness. The current preview delivery is local only; no commit, push, PR publication, merge, deployment or production activation is claimed. No additional product/test edits, process changes or database actions were performed for this final documentation update.

## Waiting-request hours eligibility — final bounded local acceptance (2026-10-21)

This followup is implemented, independently source-reviewed and locally delivered with bounded runtime acceptance. It preserves Dashboard v3, duration v2, existing historical requests and all broader rework acceptance gaps. It supersedes this followup's source-only/runtime-pending handoff; earlier checkpoints and immutable backend v2/frontend v1/v2 packets remain evidence of their respective revisions.

The server supplies `serviceHoursEligibility` on published plans, waiting rows and counter targets: `status` is `fits | does_not_fit | unavailable | not_enforced`, with `reason: {code,message} | null`, `requiredDurationMinutes: number | null`, approved `serviceHoursWindow | null` and `nextChangeAt: string | null`. Newly server-tagged requests are checked against the current earliest-start store window; this is no promise of resource availability or queue-start time. Historical untagged requests remain `not_enforced` with neutral “Earlier request · hours limit not applied” when shown; there is no inferred fit, new hours conflict, rewrite or retag. Unknown/malformed tagged requests are unavailable. A blocked/unknown request is excluded from the backend's Next eligible result. The frontend uses that exact server candidate, including an empty result, without a resource-only loaded-list fallback. FIFO stays separate. A manually selected blocked request remains inspectable as **Selected request**, with a distinct store-hours row/card reason and disabled Call, independent of resource-conflict status.

The server emits a scoped invalidation at the exact fit boundary (`close − required duration + 1 ms`); its 25-second heartbeat also checks opening/recovery changes. Stream comparison scans the complete authorized scope in 1,000-row batches under one database clock. An incomplete scan or the 2-second/10,000-row budget closes the stream rather than presenting a partial healthy result. The frontend trusts matching authorized `ready`/heartbeat health, not `open` alone. Boundary hints and authorized heartbeats invoke actual scoped GETs; heartbeats do not manufacture `observedAt` or receipt freshness. A coalesced trailing read preserves an invalidation arriving during an in-flight read. Browser 15-second polling is disconnected/unhealthy recovery only; error/gap handling and token/location cleanup are preserved. A failed GET keeps the actual last successful snapshot/receipt and the honest stale/update warning. No browser schedule calculates eligibility; elapsed timing never releases capacity or changes request outcomes.

Final independent QA report: `/Users/carloabella/.codex/local-test-harnesses/duration-store-hours-qa-20261021-readonly/eligibility-reuse-v1/QA-FINAL-REPORT.json`, SHA-256 `c9df7a9ca54f99ec74d4de524d22c937689a36fcb0de199bdf448b7d8fa1b759`, **BOUNDED_QA_PASS**. With frontend v1/backend v2, a time-only server event caused the browser's own counter GET after 7.506 ms and its response after 834.776 ms; card/row change rendered in about 1.3 seconds, without focus, navigation, manual refresh or a mutation at that boundary. FIFO VD009 became `does_not_fit`; backend Next eligible VD010 remained `fits`. Manual blocked selection retained its warning and disabled Call, with separate resource-conflict-free status. A synthetic hours reversal cleared the warning while retaining selection within 470 ms. Reviewed frontend v2 changed heartbeat freshness only: 83.640 seconds of healthy stream observation kept the stale banner absent through real GET snapshots; a **browser-only synthetic 503 interception** for 94.033 seconds preserved the last successful server timestamp/receipt and showed both stale/update warnings. Removing interception allowed normal heartbeat GET recovery and cleared those warnings without server writes. This is a browser transport-failure test, not a server-failure claim. The primary boundary setup was not repeated for v2.

Backend focused evidence is 62 passing tests. Frontend v1 has 25/25 focused tests, typecheck and a 59.82-second build; frontend v2 has the relevant 6/6 stream/readqueue tests plus typecheck, with no full build/full-suite repetition. Independent source review accepted both revisions. Final literal runtime fingerprints had no mismatches across 645 backend and 461 frontend files. Only QA-owned API5009/UI5189/DB56790/headless processes were stopped; retained fixture/private evidence files were preserved. Runtime disconnect/reconnect, unknown eligibility and amendment reversal remain source/test evidence only. Direct rejected-Call atomicity was not repeated in this feature run; prior duration runtime and current source evidence remain its provenance. Screenshots show the wide card/table; this adds no full responsive/theme matrix or physical-device acceptance claim.

Final original-preview delivery: `/Users/carloabella/.codex/local-test-harnesses/queue-hours-eligibility-review-20261021/LOCAL-DELIVERY-VERIFICATION.json`, SHA-256 `cc51fe13ddcfcf5174b714dbe4dd8b2d661ca7263ead0b3485d087996a2bc242`. The exact reviewed source union was verified; original API5007 was PID86316 and UI5187 stayed PID70155. Assigned-staff authentication in VD Sports Club / Demo Courts worked, but the current queue day was **not opened and had zero current rows**: no original-preview hours warning, historical-neutral row or candidate behavior is asserted from that screen. No business action, Open queue, lifecycle/configuration command, save, publish, retag, migration or reset occurred. All 19 business-table complete row digests/counts matched before/after, with 13 tickets unchanged. Historical requests were not rewritten or retagged.

The normal migration runner's lexical dependency-ordering defect and broader rework/acceptance gaps remain unresolved; the earlier test-only ordered bootstrap does not prove production migration readiness. This is a bounded local milestone, not full-rework completion, merge, deployment or production readiness. This final synchronization changes only the six existing documents; no additional product/test/runtime/database/Git-publication action is part of it.
