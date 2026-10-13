# Exact membership identity prerequisite

Stage B2 prerequisite for the remaining staff-invitation writer in [AI Wait-Time Prediction #378](https://github.com/munkyboi/getprio/issues/378). This slice changes only the SQL parameter encoding of `users.addTenantMembership`: exact decimal user/tenant identities reach PostgreSQL as strings instead of being coerced to JavaScript numbers. Adjacent BIGINT strings above the safe integer range must not identify the same account or vendor.

The existing SQL upsert, default staff role, active flag, optional transaction client and hydrated return value remain unchanged. Existing safe numeric callers still bind their decimal representation. A caller that already rounded an unsafe number cannot recover its original identity through this change; trusted identities must originate as exact database strings. This is not a new general input validator.

Focused repository regressions verify adjacent user/tenant combinations, the maximum PostgreSQL BIGINT, same-client insert and hydration, default-pool use, safe numeric callers, default role, existing upsert/reactivation behavior and database-error propagation. The query client is mocked; these tests establish the parameter/return contract, not live authorization, PostgreSQL concurrency, complete writer coverage or a resource transaction adapter.

## Remaining invitation boundaries

The current invitation handler still needs branch-first serialization, held current actor grants, atomic affected revisions/outbox and verified same-client commercial entitlement/seat/owner policy. Existing global GetPrio accounts without a membership in the selected vendor must remain eligible under the approved policy.

An existing membership is a separate case: the current invitation upsert can overwrite role/active state and bypass the staff PATCH's protected-role rules. This source-derived authorization gap is not repaired or approved by preserving the repository upsert here. A subsequent handler/domain fix must explicitly classify existing-member requests, compare create/edit/retry consumers, reject unauthorized role/status changes and add regressions before invitation coverage can be claimed. Repository callers outside that invitation handler must be inventoried separately.

No resource tracking, repair, configuration/plan watermark, snapshot readiness, capture or customer inference activation is introduced. The [provenance contract](resource-provenance-watermarks.md) remains proposed; exact SQL identity is one prerequisite and does not satisfy its other gates.
