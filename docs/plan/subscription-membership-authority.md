# Current vendor membership for subscription requests

## Scope and contract

Baseline: PR #439 deployed through descendant `1f0f2ff9212df0be67ffaa2cb6adf0ae280b91c1`, shared run `38539353435`. This slice closes the selected vendor-request membership read left pending by [interactive ordering](subscription-request-ordering.md).

- For `vendorRequested`, hold the exact tenant, current actor and the exact user/tenant membership before plan/history, preview and confirmation. Membership reads use `FOR SHARE NOWAIT`; known contention becomes `SUBSCRIPTION_MEMBERSHIP_BUSY`, rolls back and releases the vendor request's scoped idempotency claim before retry.
- Require the current active membership and `tenant.billing.manage` using the existing permission resolver and current actor roles. Preserve owner/admin support and the current `is_active !== false` hydration semantics. A global Platform role alone cannot bypass the vendor endpoint's active-membership requirement. Platform transition authority remains its separately prepared global-permission path.
- Reject absent vendor actors before SQL. Trusted internal system requests remain available only outside vendor-request mode. Recheck held current membership/permission before request writes; preserve opaque-context binding, transition classification, payment/term rules and response payloads.
- Exact string BIGINT actor, tenant and membership references remain distinct. Current denial occurs before preview/confirmation when revocation, demotion, movement or deletion wins. Admission-first holds accepted rows through commit; later revocation does not retroactively erase the committed transition.

## Evidence and limits

Real loopback PostgreSQL and actual vendor handler tests exercise both orders, revoked/demoted/moved membership, held rows, legacy membership-first tenant-FK contention, same-key retry/replay and exact adjacent BIGINTs. Existing current actor deletion/suspension and interactive rollback/context tests remain in the focused suite. Authentication, complete session/realm/MFA graphs, provider-evidence origin, postcommit vendor audit and all other membership writers remain separately scoped. This is selected authority proof, not complete writer certification, live financial/account mutation acceptance, resource tracking, capture or inference activation.

Related: [AI PRD](ai-wait-time-prediction-prd.md), [account-deletion proposal](account-deletion-resource-writer-proposal.md).
