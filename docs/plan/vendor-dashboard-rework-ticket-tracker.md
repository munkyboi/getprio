# Vendor dashboard rework work tracker

Updated 13 October 2026. This is the current work-item ledger for this chat's recurring monitor. GitHub inspection found no open vendor rework issues; issue #378 belongs to AI prediction. These local IDs organize the existing audited scope and do not represent GitHub issue numbers. [Progress](vendor-dashboard-rework-progress.md), [full audit](vendor-dashboard-full-audit.md), [migration inventory](vendor-dashboard-migration-inventory.md) and [preservation checklist](vendor-dashboard-rework-preservation-checklist.md) remain the scope/acceptance sources.

| Work item | State | Next action / dependency |
| --- | --- | --- |
| VD-01 Shell and Operations/Administration navigation | Merged #398/#404/#407 | Preserve approved shell and context/draft guards in subsequent slices. |
| VD-02 Live Queue and operational scanners | Merged #401 | Retain auto-close, timing and secure board approval behavior; authenticated/device acceptance is separate. |
| VD-03 Bookings, Clients and History | Merged #404/#407 | Preserve payment/check-in/frozen booking and reschedule guards. |
| VD-04 Locations, Resources and Counters | Merged #409 (`9fd91e56`) | Local design approved; post-merge review corrections are merged in PR #414 (`c3baacbf`). Runtime resource activation remains separate. |
| VD-05 Services and Availability | Implemented locally; review available | 194 frontend tests/typecheck/lint/build and synthetic browser checks pass. Address feedback; continuation to other screens is authorized. PR publication remains separate. |
| VD-06 Staff management | Implemented locally; review available | 197 frontend tests, typecheck/lint/build pass; both themes at 375/768/1180/1440px and synthetic mutation/retry/discard checks passed. Continue Settings/Queue Board; authenticated/device acceptance remains separate. |
| VD-07 Settings, business profile and Queue Board management | Authorized; pending implementation | Preserve public/private URL rotation, display grant renewal/revocation and permission boundaries. |
| VD-08 Account, subscription/billing and security | Authorized; pending implementation | Preserve MFA/recovery, owner/admin distinctions, upgrades/credits/plan exit and deletion. |
| VD-09 Reports and Ratings | Authorized; pending implementation | Preserve period/retention/exports, server metrics, moderation and paid-plan eligibility. |
| VD-10 Shared notifications, onboarding and authentication | Authorized; pending implementation | Preserve delivery/account synchronization, auth returns and role-specific journeys; coordinate mobile/platform. |
| VD-11 Workflow/station and resource runtime consumers | Blocked on authoritative server contracts and pilot readiness | Queue runtime owns allocations, writer/reconciliation/concurrency coverage and capability gates. Configuration does not activate runtime. |
| VD-12 Legacy presentation retirement and final acceptance | Pending migrated callers and evidence | Remove only unused code/styles; verify role/context/route compatibility, authenticated mutations and device behavior. |

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
