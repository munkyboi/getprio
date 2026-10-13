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
