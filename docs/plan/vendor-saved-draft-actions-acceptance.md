# Saved request draft actions — local acceptance, 2026-10-17

Saved V2/V3/V4 draft cards now expose Publish request, Edit and permission-gated trash actions. The server supplies allowedActions and provisional publishReadiness; incomplete drafts remain saveable and show disabled Publish with server reasons. Published requests never expose draft deletion. The frozen backend contract is `docs/contracts/queue-draft-actions-v1.md` in the Queue-owned account-deletion-resource-plan checkout.

Publish uses the saved catalog revision and current plan revision. Delete requires a named confirmation, revision and idempotency key. Cancel issues no DELETE. Shared command ownership blocks competing writes; lost or malformed success responses retain the exact command body/key for reconciliation. Only a validated success or authoritative deleted disposition clears the matching selected draft; newer or differently scoped selections survive. Unknown-response recovery focuses Retry same delete command. Unsaved forms remain guarded.

## Actual Opera evidence

Owner-authenticated checks ran only in the isolated qa-recovery-20261017 branch, in owned tab1555995671. No user-owned tab5624 was operated. Ready Publish was enabled; incomplete Publish was disabled with the server customer-name reason. The incomplete editor retained Save request draft. At375px, actions were44px, document width375px, keyboard traversal reached Publish/Edit/trash and tooltip text was visible.

Delete Cancel on 00f20951-bc95-4b74-a089-7af87134f7d9 issued zero DELETE requests and left collector rows unchanged. Confirm committed on the server while its response was deliberately dropped. The named dialog retained shared ownership; same-body/same-key retry confirmed deletion with one audit and receipt. Reload confirmed absence. The same controlled recovery verified selected-request URL clearing only after confirmation; the final mobile retry received keyboard focus.

A new draft was created through the actual editor: 65f62a6f-391e-4787-b0ee-2b405b4e93a5, QA Draft UI Publish 810d7fa0. Keyboard Publish issued one POST and produced ticket30/VD002 Waiting with one publication version. Reload preserved it and showed no draft trash. Agreed normal cleanup used Call, Start and the specific resource Complete action, ending Served with zero owned protected holds or active allocations.

Final collector at2026-10-17T15:46:24.287Z: draft IDs00f20951-bc95-4b74-a089-7af87134f7d9,34b92b92-a298-4e54-94cd-e69915ece4fd,c1df8610-5f90-43ab-9fa8-a3da3c9c2c07 are Discarded revision2, each with one delete audit and receipt. The published draft is revision2 with ticket30 Served and one publication version. Queue independently verified these results. User27/29 full rows match the initial QA baseline; Demo Courts pool/member copies match the pre-QA backup. User27/29 resource histories match the fresh pre-cleanup backup. Concurrent earlier user activity was preserved; no claim is made that the entire user session was unchanged.

## Validation and limits

All340 frontend tests passed, including revision/permission guards, lost-response retries, malformed-success retention, card states and late selection cleanup. Type checking, focused lint and production build passed; build retains its bundle-size warning. Backend owner reports12 draft,78 publication,214 scoped/staff and3 readiness tests passing plus typecheck/lint. Assigned-staff permission/replay/revocation are transaction-test evidence, not staff browser acceptance.

Local allowance enforcement was off: Publish produced zero allowance ledger operations, as expected. Separate enforced isolated PostgreSQL tests prove one charge/no duplicate; the local browser run does not prove charging. No runtime flag was activated.

Private read-only collectors and preservation proof are under the backend checkout `.local-preview/replacement-20261016/`, including `draft-actions-final-cleanup-served.json` and `draft-actions-user-resource-preservation.json`. Screenshots are under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`: `draft-actions-ready-desktop-dark.png`, `draft-actions-ready-375-dark.png`, `draft-delete-confirm-375-dark.png`, `draft-delete-unknown-response.png`, `draft-actions-published-375-dark.png`.

This is local acceptance only. Aggregate preview approval, physical/assistive-technology acceptance and production acceptance remain separate. No commit, push, PR, merge or deployment was performed for this milestone; schedules remain paused.
