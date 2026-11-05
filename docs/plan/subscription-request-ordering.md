# Interactive subscription-transition ordering

## Scope

Baseline: PR #438 verified deployed `41762a8681990c38d45a583efa9884f77e246041`. Covers `requestTransition` and its vendor/Platform callers. Usage/email retirement, other policy/credit publishers, complete session/grant authority, provider-evidence origin and resource/AI activation remain separate.

## Contract

- Validate known plan keys and exact numeric tenant/actor IDs before SQL. Preserve string BIGINT identity. Lock the exact tenant before current account, target plan and subscription/history. Known actor/plan/subscription contention uses scoped NOWAIT errors and rolls back, including legacy child-first tenant-FK cycles.
- Revalidate current actor deletion/access flags and, for Platform preparation, current global permission. Vendor membership/grant and authenticated session/realm/MFA proofs remain the existing caller boundary; this slice does not seal their full graph. Null/system actor remains available to trusted internal service use, never Platform-authority preparation.
- Prepare before locked preview and one-use confirmation consumption. Return an opaque one-use context bound to client, tenant, actor, target plan and vendor-request mode. Reject missing/forged/reused/cross-client or substituted contexts. Recheck held current actor/subscription state before request writes. Only service-owned calls auto-prepare inside their transaction. Caller-owned calls must supply the prepared context; missing contexts reject before SQL so preparation cannot be deferred until after child/confirmation locks.
- Preserve restricted-state, ambiguous-current, vendor downgrade/term-end exit and provider-metadata requirements, transition reasons/metadata and current immediate/scheduled classification. Immediate execution uses the prepared scheduled path under the same transaction, rather than a legacy blocking child-first path. This does not attest that request metadata is independent provider evidence.
- Known busy failures release scoped idempotency after rollback, retaining unconsumed confirmation and allowing same-key retry. Caller failure rolls back predecessor expiry, replacement subscription, transition and confirmation. Vendor audit remains postcommit and is not certified as deletion-safe delivery.

## Evidence and limits

Loopback PostgreSQL and actual route-handler regressions cover current state after waits, both publisher orders, held locks, rollback/retry, confirmation ordering, context substitution and exact IDs. Authentication, complete preview/session/provider/audit graphs remain mocked or separately inventoried; these tests do not establish live account/financial mutation acceptance or complete producer readiness.

Related: [Free assignment](free-assignment-ordering.md), [Free renewal](free-renewal-ordering.md), [scheduled ordering](scheduled-transition-ordering.md), [AI PRD](ai-wait-time-prediction-prd.md).
