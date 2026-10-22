# Vendor dashboard rework: current behavior and acceptance checklist

Status: source audit, 13 October 2026. Implementation paused for this audit. Baseline: `origin/main` at `f7435a22` (Account header fix). This supplement makes preservation requirements explicit; it does not certify migrated screens, live deployment, or physical scanner behavior.

## Relationship to the original plan

The 5–6 October design brief, workflow decisions, and migration inventory are in the planning checkout `web-app/worktrees/booking-ticket-details/docs/plan/`. They establish Operations/Administration workspaces, one identity/session, role filtering, compatible navigation, shared light/dark tokens, mobile accessibility, and staged migration. They predate several merged product changes. Copies now live beside this checklist; see the [full dashboard audit](vendor-dashboard-full-audit.md) for all-section coverage.

Apply this checklist alongside those decisions. In particular, **replace the inventory's instruction to keep monitor paths**: `/monitor/<vendor>/<location>` board access is retired. Preserve existing ticket/payment compatibility redirects and the retired-link message. Preserve customer vendor/join/ticket paths separately. The secure `/queue-board/<uuid>` route must retain the existing board UI/UX without inheriting the authenticated vendor shell.

## Auto-close and Queue Day lifecycle

- Preserve location hours, timezone, effective intervals, and server-owned Queue Day deadlines. Use server time for the displayed countdown; browser time or a redraw must never extend a deadline or authorize an overdue operation.
- Preserve the 15-minute closing warning, final-warning styling, countdown, close-now action, outcome preview, and confirmation. Keep these visible across relevant operational screens and at mobile sizes.
- The existing “Cancel auto-close” action is a confirmed, audited **30-minute extension of the current deadline**, not permanent disabling. It is allowed only during the server's closing-warning window and uses deadline-version checks. A new warning begins before the extended deadline. Any wording change must communicate this accurately.
- Keep Queue Day closure distinct from intake pause/resume and capacity-based automatic intake pause. Intake remaining open does not guarantee service before closing.
- Preserve closure outcomes: first-time waiting tickets become pending carry-over; already-carried waiting tickets expire; called tickets become unserved; skipped-ticket recovery ends. Preserve carry-over eligibility/expiry and activation on a later eligible opened day. Reopening must not undo final ticket outcomes.
- Preserve reconciling/overdue/error states, locked actions when state is untrustworthy, retry/refresh, server conflict handling, busy controls, and reconnect/query invalidation. Never manufacture a trustworthy state locally.
- Acceptance: exercise scheduled closure, warning/extension, immediate close, overdue requests, reconciliation failure/retry, reopening, timezone boundaries, and ticket consequences against the existing backend contract. Do not silently change backend lifecycle semantics during visual migration.

Source: `frontend/src/components/VendorQueueLifecycleTray.tsx`, `backend/src/services/queueDayLifecycleService.js`, `backend/src/services/queueDayTime.js`, `backend/src/repositories/queueDays.js`, and `docs/plan/queue-day-database-deadline-guards.md`. Existing lifecycle tests are starting coverage, not migrated-screen sign-off.

## Secure queue board and display management

- Settings retains a **Queue Board** tab scoped to the selected location, with the public-access switch, unique board URL, URL regeneration confirmation, approved displays, expiry/last-seen state, renewal, and revocation.
- A UUID is an opaque identifier, not encryption or an authorization mechanism. Private access remains server enforced for snapshots and streams. Preserve browser-bound grants and protected display cookies; possessing or sharing the URL must not grant access to a private board.
- Private boards show the existing approval QR/manual code and match code. Approval applies to the requesting display browser. Preserve request expiry, polling and final expiry checks, refresh/retry, and access-revoked handling that clears displayed queue data.
- Preserve public/private transitions and URL rotation semantics: regeneration revokes existing display grants and invalidates pairing requests. Approved displays currently receive 30-day access, with explicit renewal/revocation.
- Keep the **Queue board access** scanner section below **QR AND PUBLIC LINKS**. Camera, “Pairing code or QR URL”, review, display name, match-code confirmation, approval, and errors remain inside its dialog. Preserve manual entry when the camera is unavailable and release camera resources on close/context change.
- Management remains governed by `tenant.settings.manage`; pairing approval by `tenant.queue.operate`, location assignment, and current entitlement admission. Staff approval must not expose settings management. Preserve MFA/login return paths and selected-location checks.
- Retain security audit events, rate limits, stream budgets, no-store responses, safe return paths, and absence of customer-private fields in board projections.
- Acceptance: public view; unapproved private view; QR and manual pairing; expired/mismatched/wrong-location request; approval in the requesting browser versus another browser; renewal, revocation, rotation, public-to-private transition; permission/MFA/entitlement failures; scanner cleanup and mobile dialog scrolling. Physical QR scanning remains a separate acceptance check.

Source: `frontend/src/components/QueueBoardAccess.tsx`, `frontend/src/pages/SecureQueueBoardPage.tsx`, `frontend/src/utils/queueBoardPolling.ts`, and `backend/src/{routes/queueBoardRoutes.js,services/queueBoardAccess.js,services/queueBoardCookie.js,services/queueBoardProjection.js,services/queueBoardStreams.js}`. Use the existing queue-board route, access, cookie, projection, stream and polling suites when changing these surfaces.

## Live queue and counter actions

- Preserve selected-counter dispatch eligibility: disable Call next when no eligible waiting ticket exists or that counter already has a called ticket; retain queue/counter scope and backend enforcement.
- Preserve ticket confirmation, explicit service start, elapsed service timing, completion and interruption semantics. Completion and Skip current retain confirmation dialogs; interruption uses clear cancel wording and explains the resulting unserved outcome.
- Preserve recovery/cancellation permissions and per-ticket actions. Do not restore the removed Manage waiting tickets action/dialog.
- Keep Serving from inline with the action controls where space permits, with responsive stacking. Retain the horizontal separator below actions and vertical separators between In service, Queue day and Queue intake instead of reinstating their old cards.
- Acceptance: multiple counters, empty/filtered queue, existing called ticket, stale snapshots, concurrent actions, confirmation cancellation, service timing enabled/disabled, and location/counter changes during pending actions.

Source: `frontend/src/pages/VendorDashboardPage.tsx`, frontend/backend counter dispatch tests, and existing queue/service handlers. Backend/runtime changes remain coordinated with their owning chat.

## Service quantities and booking parity

- Keep the user-facing labels **Allow quantity input** and **Quantity unit label**, minimum/maximum quantity controls, integer validation, defaults, and server/customer quantity ceiling. Preserve the distinction between quantity and service-duration configuration.
- Preserve disabled quantity behavior, selected-service quantity editing, Together versus sequential behavior, pricing/duration calculation, and backend validation. Frozen booking/reschedule snapshots must retain their established contracts.
- Verify mobile min/max enforcement with the mobile owner; earlier handoff or a merged web PR alone is not proof of mobile parity.
- Acceptance: minimum/maximum boundaries, invalid/empty values, selected/unselected services, mixed-service constraints, switching booking modes, and customer/mobile submission errors. Reuse duration-unit and service-duration-limit suites.

## Cross-cutting safeguards and remaining gates

- Preserve owner/admin/staff differences, assigned locations/counters, seat/subscription limits, suspension/entitlements, required MFA, account-only access during enrollment, owner/admin billing actions, and owner-only contact/theme actions.
- Retain tenant/location context, still-permitted workspace restoration, deep links, query/hash/return state, browser history, unsaved-change protection, notifications, live refresh/reconnect and error recovery.
- Cover both themes and desktop/tablet/mobile states; retain approximately 44-pixel touch targets, keyboard/focus behavior, loading/empty/error states, persistent dialog actions, and the merged Account header height fix.
- Authentication, onboarding, billing, services, staff, clients/history, reports, ratings and settings remain in the agreed full rework scope. Inventory actual tabs/actions/permissions before replacing each screen; this focused audit is not a claim that every field on every screen has already been individually validated.
- Keep ordinary queue/booking behavior operational while workflow/station/resource features remain capability gated. Resource configuration does not certify runtime allocation, and AI planning/settings do not authorize customer-facing inference. Coordinate API/schema changes with runtime, AI, mobile and platform owners.
- Before each slice is merge-ready, attach focused regression evidence and responsive visual proof for the affected tasks. Passing source tests does not replace authenticated operational checks or direct device/physical scanning checks.

## Audit conclusion

The original plan covers the overall design and architecture, but is **not sufficient by itself** as a complete current preservation contract. This supplement closes the identified planning gaps for auto-close, secure queue-board access, recent queue UX, service quantities and the Account header. Unfinished acceptance work remains explicit above; no behavior is considered accepted merely because it appears in this document.

### VD-08 source preservation checkpoint

Retain user-wide identity/contact changes, required MFA versus optional removal, enrollment cancellation/replacement, one-time recovery display, Email OTP prerequisites, deletion authorization/receipt/retained-record warnings/session close, owner/admin commercial access and preview-token/revision contracts. Source review found and corrected selected-method visibility, billing failure-as-empty behavior, hidden perpetual MFA draft warnings and mislabeled daily ticket statistics. Browser fixtures are synthetic and cannot certify real email delivery, physical authenticator scanning, deletion processing or payment settlement. Phone removal remains a contract gap confirmed by the API owner.

### VD-09 preservation evidence

Preserved current location/day metrics, resource usage periods, unknown versus zero and existing report role restrictions. Removed inferred service-time values while retaining actual recorded activity with accurate labels. Ratings fixtures exercised read error/retry, 409 retaining checked state then exact `{visible:false}` retry, moderation-disabled control, pagination/empty page and pending navigation lock. Paid-plan/server permission remains authoritative. Synthetic review data is not production moderation or provider acceptance.

### VD-10 onboarding checkpoint

Synthetic fixtures verified generated business-link/username fields, categoryId, optional normalized PH phone, 409 preserving signup inputs then exact retry payload, Account continuation, authenticated completion without password, prefilled E164-phone normalization, customer social/card fallback, both themes/four widths and system/explicit theme behavior with scoped category portals. Native ref forwarding preserves form-registration/prefill/error-focus capability. Real OAuth redirect/completion, email/MFA delivery and device keyboard acceptance remain separate. Shared Login/notifications/callback presentation remains unfinished.

### VD-10 Login checkpoint

Preserved shared identity, safe return handling, mandatory MFA destinations, leading-zero OTP/dedup behavior, original versus email challenge tokens, recovery payload and configured provider semantics. Synthetic checks prove request-error visibility/retry, registered input error focus, retained dashboard target through password reset, and customer six-cell/card fallback. Vendor context is presentation only, never a permission grant. Real provider/mail/device acceptance remains separate.

Callback checkpoint: browser fixtures verified exact nested dashboard target on retry, customer fallback, loading/missing session, successful session handoff and stale completion suppression after hash change. No provider/session policy fork; real OAuth/cookie/provider acceptance remains external.

Operational alerts checkpoint: preserve new waiting-ticket detection, booking intake queries, existing suppression while dialogs are open, tenant/location dismissal storage and exact open/dismiss callbacks. Native alerts must remain under the actual vendor root; component fixtures alone cannot prove integrated portal placement. Synthetic dashboard stream verified root scope/fixed layout/dismissal; provider push/device receipt remains separate.

Transient feedback checkpoint: retain4000ms default, explicit7000ms errors, persistent messages, duplicate-ID no-op and five-slot FIFO overflow with timers beginning on display. Base UI renderer removal and React effect replay must finish before adding queued toasts. Verify mount-time expiry and late-unmount suppression, not only event-triggered messages. Preserve customer notification fallback and the global deletion receipt across logout. Browser fixtures do not certify delivery, screen-reader/device or provider acceptance.

VD12 access-state checkpoint: source review and synthetic browser checks retain unchanged subscription/permission guards, View plans dialog callback, Back to site(/), My account(/account/dashboard) and POST logout followed by existing vendor-return Login. Delayed identity response shows scoped loading; both themes at375/768/1180/1440 avoid horizontal overflow, with44px activation/recovery actions and readable link contrast. No production writes or live access-change/session invalidation acceptance is implied.

### 15 October 2026 — live preservation checkpoint

- [x] Carlo confirmed #446 local screen review after Account context-discard steps.
- [x] Deployment 38660293410 at 60234ed includes both #446 and API #447; API health/revision, schema and authenticated Platform smoke passed.
- [x] Authenticated native Account, Services/Availability, Staff, Queue Board settings, Reports and Ratings load; monthly18/5,000 remains distinct from daily location1.
- [x] Private board posture/approved display remain unchanged; no board/provider/business writes submitted. Account375/768/1440 has no horizontal overflow.
- [x] Unusable-token vendor reset context and exact next/pairing/hash retention verified read-only; no password entry or email request.
- [ ] Real production issued-email/reset-confirmation roundtrip, physical QR/camera/device keyboard and provider mutation acceptance remain separate.
- [ ] VD11 authoritative simultaneous pool/session contracts/readiness/reconciliation/pilot remain required.

Full evidence and limitations: progress log and /Users/carloabella/.codex/visualizations/2026/10/15/vendor446-live/verification.json.

### Linear v2 preservation evidence (2026-10-17)

Normal Opera uses separate quantity and catalog duration, explicit saved catalog acceptance, stable line IDs, revision/group preconditions and idempotency keys. Amendments send lines/reason/agreement only; identity/contact, notes and booking/payment links are protected. Concurrent user fixture edits and unsaved original tab preserved. Disposable acceptance sessions released explicitly. Allowance runtime bypass remains unchanged; exact-once ledger tests are separate evidence. Multi-station and final acceptance remain open.

### Named-resource refinement preservation (2026-10-17)

Preserve named court/member and per-parent extra identities through reorder, edits, amendments and partial outcomes. An equipment extra on Court1 is distinct from the same catalog extra on Court3. Extra duration must not exceed its own court, and actual Start is shared with that court. Do not silently clamp, substitute, drop extras, reprice, double-count court demand or reallocate completed children. No actual occupancy release from time alone. Existing fixture/catalog and flat preview evidence retained; revised runtime acceptance is separate.

### V3 direct browser preservation evidence (2026-10-17)

Court3 equipment completion left Court3 held until explicit completion. Completed Court1 equipment stayed on attempt1 through court/unfinished-Trainer interruption and retry; only two unfinished members restarted, unrelated courts unchanged. Failed called extra replacement retained original protection. Stale second-view completion rejected. Lost server200 publication/completion responses retained exact pending keys/bodies and replayed one result. Final collector0active/0protected; existing catalog/booking prices and fixture allowance bypass untouched. Linked-customer delivery and Mobile remain separate gates.

### V4 preservation checkpoint

Actual Opera VD013/VD014 finished with independent child release; Queue independently confirms one parentStart/Complete each and zero active holds. V3 history and the existing Mark draft remain preserved. Service2 temporary configuration test is isolated from service1 court policy and booking/catalog fields; exact baseline restoration is required before handoff. Queue independently verified all six historical service2 V4 leaves retained base30 and original end durations while temporary live base45 was active. No proposed V5 source/schema/data was introduced; revocation requires no destructive rollback.

Service2 exact baseline restoration is now verified at revision4 by normal administration GET and actual new intake (base30/default2/Duration). Restore command response-loss replay did not advance the revision twice. Original dark theme, viewport and interception state restored. The earlier temporary-policy preservation item above is cleared; published history remained frozen throughout.

Bounded fixed/hidden acceptance is now completed: archived service2 baseline4, temporary fixed/hidden metadata5, exact adjustable/visible restoration6 verified by fresh GET JSON equality and actual new intake. No request save/publication/holds; own QA forms discarded/tabs closed, original review unchanged. Metadata5/6 do not introduce contractV5. See the owned V4 acceptance matrix for keys/artifacts.

Queue policy grid preserves authoritative catalog active status and existing policy editor GET/PUT/revision/permissions. Current fixture3active/5inactive and later revision7 Equipment settings were read without writes or restoration to older test values. Own unsaved label verification was discarded; no policy/status/ticket/draft mutation. Existing dirty aggregate work and original queue-review tab retained.

Policy form sections preserve configured/unconfigured editor data, revision/permission and unknown-retry guards. Actual QA changed only own unsaved labels/numbers, validated hidden sections with zero PUT requests and discarded edits. Current revision7 settings were read intact; no policy, ticket, draft or resource mutation. Existing user fixtures and unrelated aggregate changes retained.


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

### 2026-10-20 duration reconciliation

- [x] Reproduce actual callback loss of required/optional extra lineage before correction.
- [x] Preserve IDs/member IDs/quantities/durations on parent duration edits; reset catalog acceptance and agreement. Independent callback retest and3 permanent regressions pass.
- [x] Keep explicit optional removal, required-extra validation and parent-duration review guards; resource-only empty selections remain empty.
- [ ] Independent server saved-draft save/reopen/replay with historical extras (in-memory serialization round-trip is not this evidence).
- [ ] Rendered resource-read unavailable/Retry recovery and disclosure input-value preservation.
- [ ] Explicit server resource-only NEW-intake capability/validation and customer handoff; no historical conversion/deletion authorized.

Consolidated acceptance owner: WIP: Lead GetPrio QA. Verified checkpoint remains immutable; no production acceptance inferred.

### Public access/recovery UI preservation — 2026-10-20

- [x] Preserve public URLs/copy/Open board/Save QR and scanner component/props; keepMounted disclosure remains.
- [x] Two sibling public cards, intrinsic heights, mobile-first layout and QR aspect-ratio/link-width safeguards implemented.
- [x] Carry-over remains read-only; legacy Restore callback/credential/day/threshold/busy guards remain page-owned; skipped-plan Recall stays separate.
- [x] Recovery table uses actual loaded rows, human ticket/customer labels and in-table empty state; no totals or recovery behavior fabricated.12focused developer tests, frontend typecheck and diff check pass.
- [ ] Independent375/768/1440 rendered QR/grid/table and empty/populated recovery acceptance.
- [ ] Independent keyboard/disclosure/scanner state/dirty-close/busy and Restore-vs-Recall acceptance.

Frozen QA baseline, active demo and immutable checkpoint were not modified. QA receives a separate versioned frontend copy.

### R3 final scoped QA evidence — 2026-10-20

- [x] Actual main-route5197 public cards/disclosures390/768/1440 PASS;390 satisfies mobile acceptance. Desktop two-column cards and empty recovery checked.
- [x] R2 synthetic functional/light PASS remains valid:23carry-over rows10/10/3; Missed10loaded cap/disabled Next; searchQM010→1, newest sort, empty table and local mock Restore Escape/focus return.
- [x] R2 static-serving security PASS remains valid: private/source/dependency/traversal403, unknown404/no fallback, root/assets200/hash/MIME, HEAD/POST405.
- [x] R3 synthetic dark presentation PASS after wrapper-only production-context correction; actual frozen product component/styles unchanged. Workspace/main computed foreground250,250,250 and background9,9,11; readable headings/labels/notices/ticket identities/controls/data at375/768/1440. Harness9tests/build/typecheck PASS reported.
- [ ] Separate real recovery / Restore / plan Recall and idempotency outcome evidence; synthetic local mock Restore does not close these gates.

History retained: R1 security FAIL superseded by bounded R2 static fix; withdrawn R2 dark PASS and actual1440 dark FAIL superseded by R3 wrapper correction and fresh recaptures. Old `qa-1440x900-dark.png` was narrow, not desktop PASS; corrected R2 dark artifact remains historical FAIL evidence. Final screenshots under `/Users/carloabella/.codex/local-test-harnesses/vendor-recovery-synthetic-20261020T2250`: `qa-r3-1440x900-dark.png` (actual1440×900), `qa-r3-768x1024-dark.png`, `qa-r3-375x844-dark.png`. Final review manifest `5300a23021c919525a08bd5e8b6f6c1434fc44da2fdf26a2698cfe4e275d8334`.5207 QA-owned/running; original5197/API/DB/proxy unchanged. Docs only, no product/runtime changes or repeated tests. Full rework not complete.

## New Dashboard preservation evidence — 20 October 2026

- Existing dirty source is preserved against the verified post-cleanup source checkpoint; no reset/stage/commit/push or runtime restart.
- New overview composes existing workspace/Card/Chart/Sheet/Button, business/location context, role/MFA/direct-route checks and navigation guard. Operations lands on Dashboard; remembered Administration still lands on Settings.
- Read-only Dashboard supplies no Call/Start/Complete/Interrupt/Recall/Restore commands. Live queue remains the operational destination.
- Current-date waiting, distinct requests using resources and explicitly loaded waiting/called bars preserve their separate meanings. No all-time waiting total, complete in-service total, history, revenue or forecast is inferred. Waiting now uses the authoritative current queue-date waiting count excluding future bookings, without an eligibility claim.
- Exact per-pool capacity/used/available/protected/overdue units remain separate; unknown quality suppresses usable availability and percentages, over-capacity text remains exact, overdue is a used subset, and unlike pool units are never totaled.
- Scope/session changes and 401/403 prevent stale foreign/unauthorized data and Sheet disclosure. Transient faults preserve only timestamped, visibly stale last-good observations.
- Focused model/stream/presentation tests and source checks are implementation evidence. Bounded light/dark, mobile, keyboard Sheet/focus and authenticated SSE/access-revocation acceptance is recorded below; stress/full-matrix limits remain explicit.

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
