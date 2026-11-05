# Free-period renewal ordering

## Scope and contract

Baseline: PR #437 verified deployed `0033bfe23630c5d772f6f5ba98ac86642069e2be`. This slice covers automatic `renewFreeSubscriptions` and its existing execute-due retry boundary. It does not alter interactive transitions, period policy, paid renewal, usage/email retirement or resource/AI activation.

- Enumerate due active Free subscriptions with exact identifiers and deterministic numeric tenant/subscription order. Discovery is a hint; lock each tenant before its subscription using `FOR UPDATE NOWAIT`, then reread current linkage, plan, status and period before mutation. Missing/deleted or newly ineligible rows make no renewal; moved linkage fails closed with a scoped conflict.
- Own one transaction per candidate or use the explicitly supplied caller transaction. Own batches may commit earlier candidates before a later failure. Existing execute-due scoped idempotency releases known busy/scope-changed failures so same-key retry continues remaining due work; completed success is replayed.
- Preserve PostgreSQL recursive one-month catch-up from the existing end, including end-of-month semantics. Freeze a single database wall-clock observation after lock waits; derive an interval containing that observation, never application time or transaction-start time. Null/not-yet-due and non-Free/restricted/expired rows are not renewed. Nonfinite eligible periods require reconciliation rather than unbounded recursion.
- Hold tenant/subscription locks through commit. Known legacy subscription-first contention fails fast and rolls back; unrelated SQL failures propagate. No plan/catalog read is introduced because renewal retains the existing plan and row identity.

## Evidence and limits

Loopback PostgreSQL tests cover competing renewals, legacy child-first tenant-FK contention, tenant-first ordering, current eligibility/linkage rereads, retained monthly anchors, rollback/retry and partial-batch same-key retry, exact BIGINT identities and caller-owned rollback. Selected regressions and deployment read smoke are not live financial/account mutation acceptance, complete publisher coverage or representative prediction evidence. Session/grant actors and interactive/catalog/override/credit publishers remain separately scoped prerequisites.

Related: [Free assignment](free-assignment-ordering.md), [scheduled execution](scheduled-transition-ordering.md), [AI PRD](ai-wait-time-prediction-prd.md).
