# Platform dashboard rework progress

This tracker separates implementation, review, merge, deployment and live acceptance for the agreed Platform dashboard rework. It is the handoff backlog for scheduled follow-through, not approval to add product scope or change production policy.

## Verified release checkpoints

Checkpoints below were verified on 13 October 2026. They describe the tested releases, not a permanently current production revision. Verify the latest deployment before operational actions.

| Slice | Merge and deployment evidence | Verified boundary | Remaining boundary |
| --- | --- | --- | --- |
| Safe maintenance | [PR 410](https://github.com/munkyboi/getprio/pull/410), [run 38397048813](https://github.com/munkyboi/getprio/actions/runs/38397048813) | Schema and authenticated release smoke; public policy disabled | Production activation requires an agreed operational window. Native full-screen consumption belongs to the mobile client. |
| AI controls usability | [PR 415](https://github.com/munkyboi/getprio/pull/415), [run 38405098764](https://github.com/munkyboi/getprio/actions/runs/38405098764) | Requested/effective/customer-state presentation observed while saved policy remained unchanged | Inference/capture/resource activation and customer forecasts are not established by this UI. Further disclosure interactions remain local regression evidence. |
| Service health tabs | [PR 417](https://github.com/munkyboi/getprio/pull/417), [run 38409968621](https://github.com/munkyboi/getprio/actions/runs/38409968621) | Live keyboard/tab navigation, retained filter and unsaved draft; test draft discarded | Read-only-role and outage scenarios were exercised locally, not induced in production. |
| Platform Sonar findings | [PR 421](https://github.com/munkyboi/getprio/pull/421), [run 38419234141](https://github.com/munkyboi/getprio/actions/runs/38419234141) | Exact live merge `3cf8dba18f63dd66f5dd7ffe054281ac321a816f`; schema/authenticated smoke and command-search keyboard checks | Account-deletion identity safeguards and legacy subscription failure handling are local regression evidence. No destructive production cleanup smoke. |

The later [run 38419599609](https://github.com/munkyboi/getprio/actions/runs/38419599609) served `20089c66b776f8ff4bfb919ab193de2e726112f5`, a verified descendant of PR 421. A deployment run's headline SHA is not sufficient: inspect its actual checkout/`DEPLOY_SHA`, smoke expectation and independent live API/dashboard revision.

## Next authorized work

| Priority | Item | State and owner | Completion condition |
| --- | --- | --- | --- |
| 1 | Verify rollout and main analysis for Sonar issue `AaDuG_sVEQH4ITnAStg9` (`typescript:S9383`): handled checkout promise in `frontend/src/pages/VendorDashboardPage.tsx` | Vendor-owned [PR 425](https://github.com/munkyboi/getprio/pull/425) merged as `cc57e2e4f722396d3670c19d83ef92dcfeea6f22` on 13 October 2026 at 21:02:59 UTC, from head `cdbe8c689b3051191f95d14d6361991e996a477d`. PR checks passed. Implementation/review are no longer pending; do not duplicate. | Verify actual deployed revision includes the merge, authenticated smoke and current main Sonar analysis separately. A successful workflow headline alone does not complete these remaining acceptance checks. |
| 2 | Consolidate acceptance for existing Platform pages | Pending read-only Platform audit | For Help Center, Plan Matrix, Tenants, Users, Billing and Settings, record source/test coverage, existing user acceptance and current non-mutating live checks. Do not infer mutation acceptance from a build or read-only smoke. |
| 3 | Historical cross-app duplication | Assessment complete; cross-owner implementation not assigned | Coordinate customer/legacy Platform ownership before extracting shared PromptActionModal, ConfirmActionModal or StyledQRCode implementations; preserve both apps' contracts and tests. No exclusions or gate weakening. |
| 4 | Resource and AI readiness dependencies | AI/controller scope: [umbrella 378](https://github.com/munkyboi/getprio/issues/378) and [controller contract 380](https://github.com/munkyboi/getprio/issues/380). Resource provenance: merged [PR 422](https://github.com/munkyboi/getprio/pull/422), `docs/plan/resource-provenance-watermarks.md`. Queue/account-deletion transaction prerequisites: open [PR 428](https://github.com/munkyboi/getprio/pull/428), `docs/plan/account-deletion-resource-writer-proposal.md`; review findings remain pending. These references identify the separate owning work streams; do not duplicate implementation. | Verify the referenced contracts' runtime prerequisites and approval gates, including provenance implementation and account-deletion lock ordering/dispatch eligibility. PR 422 and PR 428 are documentation, not runtime activation evidence. Requested policy and inventory UI do not activate resources or forecasts. |

Existing page implementations can be inspected in [App.tsx](../../platform-dashboard-shadcn/src/App.tsx), [Help Center manager](../../platform-dashboard-shadcn/src/components/platform-help-center.tsx), [Plan Matrix](../../platform-dashboard-shadcn/src/components/plan-matrix.tsx) and [account settings](../../platform-dashboard-shadcn/src/components/platform-account-settings.tsx). These source links establish implementation locations, not complete release acceptance.

## Follow through rules

- For each item, record its owning chat, branch/PR, exact reviewed head, tests, unresolved findings, required approvals, merge SHA, actual deploy run/revision and live acceptance gap.
- Automatically fix in-scope review findings and rerun checks. Reply to the original finding with the fixing commit and verification; acknowledge only after resolution is verified.
- Report ready for merge only when checks, Sonar, required reviews and unresolved-thread requirements are satisfied. `NONE` from Sonar is not a passing analysis.
- After an approved merge and verified deployment, select the next authorized, dependency-ready item without another continuation request. Prioritize regressions and failed releases.
- Preserve unrelated edits and coordinate shared files before implementation. If Storage0 disappears, stop volume-dependent operations; verify the worktree, branch, status and dependencies after restoration. Do not reset/recreate checkouts as a workaround.
- Do not merge, dispatch/retry deployments, change production permissions/settings, activate maintenance/AI/resource gates, or run destructive production deletion smoke without explicit approval. Preserve local screen-review and other acceptance gates.
- Keep unchanged/non-actionable monitoring quiet. Notify on meaningful progress, ready PRs, failures, completion or required human action. Do not mark the entire rework complete while required acceptance or owned dependencies remain open.

## Operator references

- [Safe maintenance runbook](../runbooks/platform-maintenance.md)
- [AI Inference Platform Admin guide](../platform/ai-inference-admin-guide.md)
- [AI controller authority and serving boundary](platform-ai-inference-controls.md)
