# Scheduled subscription transition ordering

## Scope

Baseline: verified deployment `536e252dd842b8651c7eea583dd8d088f44d48e5` from PR #432. This slice changes only scheduled execution reached through `executeDue`, its selected Platform idempotency registration, and exact tenant binding in subscription creation. Interactive transition requests, immediate execution, automatic Free assignment, Free period renewal, credits, plan publication and other preview actions remain separate protocols.

## Execution contract

- Each due transition keeps its existing independent transaction. Locate its tenant without a child lock; acquire that exact tenant with `FOR UPDATE`; re-read the transition with `FOR UPDATE NOWAIT` and reject a moved tenant before writing.
- Bind an opaque prepared context to the transaction client, transition identity and held tenant. Scheduled execution consumes that context, re-reads the transition and checks the mapping again. Forged, wrong-client, wrong-target and reused contexts reject before SQL. The existing direct execution entrypoint remains the legacy path for immediate/Free callers; it is not certified by the scheduled context.
- Hold the target plan with `FOR SHARE NOWAIT` and current subscription history with `FOR UPDATE NOWAIT` before expiring or inserting subscriptions. Only conflicts from those known NOWAIT reads become retryable `SUBSCRIPTION_PLAN_BUSY`, `SUBSCRIPTION_BUSY` or `SUBSCRIPTION_TRANSITION_BUSY`. Parent acquisition and unrelated database failures retain their original error identity. Rollback releases all held rows.
- Preserve effective-transition idempotence, readiness/effective-time checks after waits, predecessor revision and ambiguity checks, restricted-to-Free rejection, paid provider evidence, reason, metadata and transition outcomes. Missing locator/tenant/transition yields no mutation.
- New subscription creation preserves exact string tenant IDs; an unsafe numeric ID is rejected before SQL because its original identity cannot be recovered. No allowance, entitlement DTO, billing provider or customer estimate policy changes.
- Only the selected execute-due idempotency registration releases pending claims for the three known lock-conflict codes after transaction rollback. Earlier transitions in a batch may already have committed; a same-key retry safely selects remaining scheduled work. It does not promise atomic batch rollback or reconstruct an earlier partial response. Once successful, the final response completes and replays normally. Other errors retain existing behavior.

## Verification and boundaries

Use real loopback PostgreSQL and actual lifecycle/billing repositories and `executeDue`: scheduled commit/retry, fault rollback, both parent/legacy-child contention orders, changed mapping/predecessor/effective time after waits, restricted and ambiguous histories, provider evidence, opaque context isolation, exact BIGINT identities and same-key partial-batch retry/replay through real idempotency middleware. The shared HTTP-response harness models JSON serialization and invokes the actual error handler; it does not execute authentication middleware or prove a live financial mutation.

These are durable scheduled intents, not newly authenticated actor-owned commands. The selected Platform route retains its existing middleware permission/release controls; this slice does not establish current held actor/session/grant authorization for that route. It does not reinterpret retained financial intent when an originating account is deleted, remove creator history, or implement the broader account-deletion/commercial protocol.

Free renewal still runs after transition execution with its existing separate implementation. Immediate/Free callers still use legacy direct execution. Remaining publisher and plan-policy graphs, reconciliation, writer coverage and complete snapshots are not certified. This work does not activate resource tracking, private capture or customer inference, and synthetic regressions do not establish production prediction accuracy.

Related: [suspension ordering](subscription-suspension-ordering.md), [activation ordering](subscription-activation-ordering.md), [AI PRD](ai-wait-time-prediction-prd.md), [account deletion proposal](account-deletion-resource-writer-proposal.md).
