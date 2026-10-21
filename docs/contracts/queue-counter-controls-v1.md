# Queue counter controls and plan recovery v1

Status: API source review cleared; backed-up local preview migrated and restarted. Vendor browser acceptance pending. Not deployed to production.

## Counter context

`GET /vendor/tenant/:tenantSlug/queue/counter-controls?location=:locationSlug&counterSlug=:counterSlug&requestKey=:requestKey` returns `QueueCounterControlsV1` from `shared/queueCounterControlsV1.ts`.

The response identifies the current counter ticket and the next eligible waiting ticket, with enabled actions, explicit block reasons, and typed command descriptors. The next candidate uses the same booking readiness, station/counter eligibility and priority ordering as the transactional claim. Resource shortages do not permit jumping to a later customer.

This GET does not claim tickets, reconcile expired reservations, allocate resources or change a plan. `contextKey`, `requestKey`, and `observedAt` support freshness and response ordering only. Every write reauthorizes and revalidates state in its transaction.

Plan descriptors use the existing `/queue/plans/:planId/:action` endpoints. Legacy descriptors use existing queue endpoints. A selected-counter write carries both `counterSlug` and `expectedCounterId`; partial bindings are invalid. The server verifies the binding and exact current ticket under the transaction. Existing unbound request-card commands retain their compatibility contract.

Customer confirmation remains required before Start. The descriptor must lead to the supported confirmation/request flow; it cannot bypass confirmation. Nested member outcomes remain in the request view instead of flattening the whole request into one Complete action.

## Retry ownership

The vendor toolbar and request cards share one pending command owner. Retain the exact command body and idempotency key after an ambiguous response; retry them together. Refreshing a descriptor must not silently replace a command that may already have committed.

Legacy Call next supports an optional durable idempotency receipt scoped to tenant, location, actor and key. The receipt and claim commit atomically with the queue event/outbox. Reusing the key with a changed command fails. Replay reauthorizes, returns the original target with a fresh snapshot, and never claims another customer or sends a second notification. Clients without a key retain their existing behavior.

## Skip

Plan Skip requires the current Called, unstarted stage, revision guards, the exact current unexpired reservation group, and a reason of 1–500 trimmed characters. It releases all promise members atomically, records the actor/reason, and marks the stage and current children Skipped. No allocation is created. The original ticket and frozen plan survive.

Started, paused or allocated current work cannot be skipped; it requires explicit outcomes or Interrupt. A later unstarted stage may be skipped even when the parent first-start clock is already set. Earlier completed stages, prior released allocations, future pending stages, and the parent first-start clock remain intact.

Skipped tickets are excluded from Call next until an explicit Recall. Skip is distinct from cancellation and reservation expiry.

## Recall

Vendor-only `POST /queue/plans/:planId/recall` requires current revision guards and a 1–500 character reason. It verifies the same open Queue Day and current intake/capacity policy. In a non-enforced branch, today's date comes from the database clock in the current branch timezone, not from the old ticket date.

Recall creates a new attempt for the same frozen current stage and its children. The old skipped attempt remains immutable history; its children become noncurrent. Recall returns the ticket to Waiting, clears the old call/confirmation binding, and does not automatically Call or allocate.

Recall preserves the original priority band, age and sequence. It does not issue a new ticket or consume another publication allowance. This explicit plan policy differs from the existing legacy restore-skipped policy, which remains unchanged.

Recovery queue events carry the updated ticket state and the new stage-attempt identity, with the previous attempt identified for Recall. Audit, receipt and state changes share the same transaction.

## Verification and outstanding gates

Local isolated PostgreSQL publication suite: 76 passing tests, including concurrent Start/Skip and Recall, counter mismatch, immutable skipped history, later-stage preservation, and non-enforced Queue Day validation. Counter-context suite: 5 passing tests, including expired protection and confirmation gating. Scoped service/legacy receipt suite: 213 passing tests on the current source.

API review cleared the response contract and the exact shared files were handed to Vendor. Canonical issue #461 records the approved semantics and current evidence. A fresh verified backup preceded both local migrations and the owned API restart. Normal password/TOTP authentication confirmed HTTP 200 for counter controls, control version 1, and the current open Queue Day. No user request was mutated.

Outstanding: vendor integration and full browser acceptance; final acceptance evidence update. Customer lifecycle can project a skipped plan as recovery, but customer self-rejoin has not been accepted and does not grant vendor Recall authority. No production or release claim follows from these local tests.


## Local browser QA fixture

Dedicated branch `qa-recovery-20261017` (location 3) isolates toolbar acceptance from existing Demo Courts requests. Counters `qa-recovery-1` and `qa-recovery-2` belong to this fixture. Its own services 13/14 and pools 11/12 provide one named court plus two named trainer executions.

Initial published request: VD001, ticket 28, plan `8bcbf0fd-1285-420c-855a-f4a5716b0539`. Baseline collector observed Waiting, three current children, zero protected reservations, zero active allocations and zero parent starts. Counter context identified this exact plan as next and returned an enabled bound Call command. No browser action is implied by this setup evidence.

The fixture was created after a fresh verified backup at 2026-10-17 19:56:15 Manila. Existing branch workflows, ticket priority and user requests were not changed. Browser checkpoints must verify Call protection, complete Skip release, preserved ordering/new attempt on Recall, fresh Call protection, Start allocation, stale counter rejection and individual release before declaring acceptance.


Browser lifecycle evidence (2026-10-17, owned Opera QA tab): toolbar Call → reasoned Skip → reasoned Recall → toolbar Call → toolbar Start succeeded on ticket 28 only. Independent snapshots recorded three protected members after each Call, zero holds/allocations after Skip and Recall, and three allocations after Start. Individual trainer releases reduced active allocations to two then one; court completion ended Served with zero holds/allocations, one parent start and one parent completion.

Cross-snapshot assertions confirmed the same ticket, original priority band/sequence/created-at, unchanged allowance and publication version count, three historical noncurrent skipped children, a new current attempt, and an unchanged old skipped stage through final completion. Alejandro's complete ticket 27 row matched the fresh pre-QA backup via read-only COPY comparison. No restore was performed.

An optional legacy local resource panel returned the expected 404 on this unmarked QA branch. Its UI handling is being corrected without widening the local fixture opt-in boundary. Mobile width, stale counter behavior and final UI checks remain pending; do not infer these from the successful lifecycle.

### FIFO and eligible dispatch

`fifoNext` identifies the first ready request in the established queue order. `actions.callNext` calls that request and does not skip resource conflicts. `next` identifies the first ready waiting request whose server availability projection permits a call. `actions.callNextEligible` calls that request using `dispatchMode: "nextEligible"`; the command rechecks candidacy inside the scoped transaction before claiming the exact ticket. Changed candidacy rejects with `ELIGIBLE_CANDIDATE_CHANGED`. Both paths retain booking readiness, counter/station scope, current-call occupancy, authorization, revisions, and transactional resource checks.

Current-ticket controls are absent until a request has been called. Confirmation is shown only for an unconfirmed remote join and validates its current QR or legacy lookup credential. Confirmation only records arrival; it never starts a stage or changes allocations. Named-plan Start also enforces confirmation on the backend for remote joins.

The request card uses `dispatchMode: "selectedRequest"` to call the displayed plan. It retains the shared ready-waiting counter/station predicate and resource reservation transaction, but does not replace the selected plan with the FIFO or automatic eligible candidate. The toolbar exposes separate `Call next` and `Call next eligible` actions; inspecting a request does not change either toolbar target.
