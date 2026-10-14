# Vendor dashboard rework work tracker

Updated 14 October 2026. This is the current work-item ledger for this chat's recurring monitor. GitHub inspection found no open vendor rework issues; issue #378 belongs to AI prediction. These local IDs organize the existing audited scope and do not represent GitHub issue numbers. [Progress](vendor-dashboard-rework-progress.md), [full audit](vendor-dashboard-full-audit.md), [migration inventory](vendor-dashboard-migration-inventory.md) and [preservation checklist](vendor-dashboard-rework-preservation-checklist.md) remain the scope/acceptance sources.

| Work item | State | Next action / dependency |
| --- | --- | --- |
| VD-01 Shell and Operations/Administration navigation | Merged #398/#404/#407 | Preserve approved shell and context/draft guards in subsequent slices. |
| VD-02 Live Queue and operational scanners | Merged #401 | Retain auto-close, timing and secure board approval behavior; authenticated/device acceptance is separate. |
| VD-03 Bookings, Clients and History | Merged #404/#407 | Preserve payment/check-in/frozen booking and reschedule guards. |
| VD-04 Locations, Resources and Counters | Merged #409 (`9fd91e56`) | Local design approved; post-merge review corrections are merged in PR #414 (`c3baacbf`). Runtime resource activation remains separate. |
| VD-05 Services and Availability | Implemented locally; review available | 194 frontend tests/typecheck/lint/build and synthetic browser checks pass. Address feedback; continuation to other screens is authorized. PR publication remains separate. |
| VD-06 Staff management | Implemented locally; review available | 197 frontend tests, typecheck/lint/build pass; both themes at 375/768/1180/1440px and synthetic mutation/retry/discard checks passed. Continue Settings/Queue Board; authenticated/device acceptance remains separate. |
| VD-07 Settings, business profile and Queue Board management | Implemented locally; review available | Scoped forms, guarded drafts, notification rollback and confirmed board access/display tasks; 199 tests/typecheck/lint/build and responsive fixtures pass. Continue Account/security/billing; authenticated/device acceptance remains separate. |
| VD-08 Account, subscription/billing and security | Implemented locally; live acceptance gaps retained | Scoped account forms/tabs, shared challenge/security dialogs, billing readiness and capacity retry. Phone removal has no supported API contract; live/provider acceptance remains separate. |
| VD-09 Reports and Ratings | Implemented locally; live acceptance retained | Scoped real snapshot/period metrics, recorded intervals, paid/moderation-safe ratings with pagination/retry/navigation locks. No inferred service durations or staff Reports expansion. |
| VD-10 Shared notifications, onboarding and authentication | Implemented locally; external acceptance retained | Auth/onboarding/callback and scoped operational/transient notifications locally verified; preserve global deletion receipt and customer defaults. Real delivery/provider/device acceptance remains separate. |
| VD-11 Workflow/station and resource runtime consumers | Required; blocked on authoritative pool/session contracts and pilot readiness | Deliver simultaneous pooled service, independent exact-ticket/session controls and capacity/release acceptance. Existing per-counter called lanes and configuration-only pools do not satisfy this item. Queue runtime owns backend prerequisites; vendor chat owns UI consumers. |
| VD-12 Legacy presentation retirement and final acceptance | Consumer inventory in progress; acceptance pending | Remove only unused code/styles; verify role/context/route compatibility, authenticated mutations and device behavior. |

## Recurring execution rule

The `Continue vendor dashboard rework` heartbeat checks this chat hourly. Refresh actual issue/PR/check state and connected-chat ownership before choosing work. Continue implementation, current-slice defects/review comments, tests and documentation autonomously. Do not duplicate an active turn or another chat's owned changes. Record meaningful completion/blockers in progress and this ledger.

Carlo authorized end-to-end implementation on 13 October 2026, superseding the per-screen local approval stop. Continue across all unblocked remaining slices while presenting reviewable local milestones and incorporating feedback. Maintain coordinated ownership and documented external blockers, and continue other work when one item is blocked. PR publication still follows separate authorization; merge/deployment and runtime/pilot activation require their own authorization and evidence. Keep notifications quiet when nothing actionable changed; report reviewable results, meaningful failures or decisions requiring Carlo. Historical checkpoints below retain their original authorization context.

When a related PR is verified deployed at the intended revision, automatically begin the next unblocked work item after focused health/smoke checks and ownership coordination; Carlo need not say continue. Record acceptance gaps and address defects that block the next item. Deployment is a continuation trigger, not a requirement to stop other authorized implementation while a rollout is pending.

## PR triage checkpoint: 13 October 2026, 12:45 UTC

[PR #414](https://github.com/munkyboi/getprio/pull/414) follows up #409's post-merge checkbox-guidance/staff-search comments and its own Enter-key review finding. All three actionable comments are addressed, verified, replied with fixing commits, acknowledged and resolved. Published head is `6d7d3348c44534562002ba7332767ad140fe150b`; CI/CodeQL pass and fresh Codex review completed with no new findings. GitHub still requires an approving review. Sonar's current OK report belongs to `4079c55c`, so latest-head Sonar analysis is pending and merge readiness is not claimed.

Continue #414 triage in `web-app/worktrees/vendor-configuration-review-followup` (branch `codex/vendor-configuration-review-followup`); verify actual head/analysis SHA and review requirements before declaring ready. Keep the Services preview in `vendor-secure-queue-board` on its unpublished Services branch. Neither PR merge nor deployment is authorized by this checkpoint.

## Coordination inventory refresh

Verified PR #414 merged at `c3baacbf68feee20b4d69a77e7c3d9dd6b82630f`, with final head `6d7d3348`. Latest-head CI, CodeQL and Sonar checks passed; fresh Codex review completed and all actionable threads are resolved. GitHub retains a REVIEW_REQUIRED field on the merged PR; it is no longer an open merge gate. There are currently no open vendor-owned PRs. Services/Availability remains unpublished and awaiting local approval.

Earlier vendor slices through #409 are ancestors of successful deployment workflow run `38397048813` (`df5fc820`); direct vendor runtime acceptance remains separate. Correction: deployment run `38401124094` targets earlier `1697ba5b` (#413), which is an ancestor of #414 and does not contain it. The separate #414 deployment is run `38401906957` at `c3baacbf`, queued behind the earlier rollout. #414 is not claimed deployed or live. The central PR coordination chat requested inventory collection and will delegate deployment triage after Carlo's merge confirmation; this inventory refresh does not initiate deployment or transfer code ownership.

## Deployment acceptance checkpoint

Supersedes the pending inventory above: delegated #414 deployment triage completed through existing successful run `38401906957`, exact revision `c3baacbf68feee20b4d69a77e7c3d9dd6b82630f`. Schema verification and authenticated Platform smoke passed; live API health reports this exact SHA and public frontend serves the fixes. Carlo signed in and fresh production read-only vendor acceptance passed staff filtering/clearing, Enter without submission, search-only close without a draft prompt and arrival/payment checkbox help associations. No production writes were made. Checked/hidden selection retention is test/fixture verified because the live counter has no assigned staff. Services/Availability remains unpublished pending local review; runtime resource/workflow gates are unchanged.

## Pooled concurrent service checkpoint

Carlo reaffirmed multiple-ticket handling on 13 October 2026. Queue owner confirms ticket-targeted start/complete/interrupt and transactional allocation/release primitives with real PostgreSQL contention tests exist, but each counter still admits one called ticket. Starting service does not free an invitation lane or convert it into interchangeable pool capacity. Four configured courts alone therefore do not establish four simultaneous pooled sessions.

Remaining contracts: authorized waiting/called/active-session snapshots and streams with exact ticket/session/allocation IDs, held units, availability/block reasons and revisions; atomic capacity-aware admission/start and protection conversion; exact-session completion/interruption releasing once; explicit counter-lane versus pooled-session semantics. Missing runtime prerequisites include remaining staff-access/account-deletion/platform writer coverage, configuration/plan/segment watermarks, historical reconciliation, authoritative inventory assembly and reviewed activation/live acceptance. Workflow stage/arrival/transition APIs remain separate unfinished runtime work. PR #419 is verified merged at `34288203`; its writer change does not prove complete readiness.

Queue owner is coordinating the next bounded staff-access writer prerequisite with API/AI path ownership. Vendor chat owns subsequent UI consumers. End-to-end acceptance must demonstrate four-court simultaneous service up to capacity, rejection when full, exact-target resolution and reuse after release without stale actions affecting another customer. Do not mark the full rework complete with configuration-only pools, counter lanes or UI/source tests alone.

## Restored workspace and Sonar follow-up

After Storage0 returned, the vendor worktree was verified clean at `2e47e698`, with the expected unpublished screen commits intact. The isolated checkout async-intent correction was applied to current main `20089c66` in a separate worktree and published as [PR #425](https://github.com/munkyboi/getprio/pull/425), head `cdbe8c68`. All 190 baseline frontend tests, typecheck and affected-file lint passed. Fresh Codex review completed with no findings and all hosted CI/CodeQL checks passed on this head. SonarCloud Code Analysis now passes with PR quality gate OK (new reliability/security/maintainability A, duplication 0%). The required approving review remains outstanding. Merge readiness is not claimed. The local preview was restarted after the volume outage and returned HTTP 200. No unpublished screens are included, and no merge/deployment was performed.

## Email allowance retirement review checkpoint (14 October 2026)

Vendor/public frontend draft [#433](https://github.com/munkyboi/getprio/pull/433), head ae28e4b8dbfbb6beb96e269eed565bddd1ada56c, is isolated from unpublished rework screens. Both current actionable Codex findings were fixed, tested, replied with commit/evidence, acknowledged and resolved; fresh review and latest hosted gates remain pending. Backend companion draft [#434](https://github.com/munkyboi/getprio/pull/434), head2256588e93cb24b6dd3108b42f07b593dac92884, owns quota/credit retirement, usage accounting and the optional unmetered snapshot marker. Preserve paired release and formal review requirements. No merge/deployment/runtime evidence is implied.

Equivalent local rework changes pass209 frontend tests, types/lint/build. VD12 removed seven dedicated zero-caller sidebar style rules with a successful build; shared styles and customer/public consumers remain. Preview5179 remains available. VD11 pooled-session contracts/readiness and final authenticated/provider/device/deployed acceptance remain required.
