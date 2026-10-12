# Platform AI Inference controls

Issue #380 supplies the Platform Admin controller for PRD #378. It does not activate a model, resource tracking, observation capture, or customer estimates.

## Policy and authority

`/ai-inference` is a dedicated Platform sidebar route. `platform.ai_inference.read` and `platform.ai_inference.manage` belong to the existing Platform Admin role. Other roles and release observers receive neither capability. Server middleware and the service enforce authorization independently of navigation visibility. Reads are `no-store`.

The singleton `ai_inference_policy` starts Off, revision 1, timeout 100 ms, maximum snapshot age 1,000 ms, and no pilot locations. Requested mode is Off or Private shadow. Up to 100 exact tenant/location pilot policies are permitted. Global Off overrides every pilot. Scope membership is checked against `store_locations`; unknown or mismatched locations are rejected. Timeout is an integer 1–1,000 ms; freshness is an integer 1–5,000 ms. Customer mode and arbitrary settings are rejected. No provider URL, credential, artifact upload, or ready flag is accepted.

Saving uses a server-normalized preview binding the policy, audit reason and current revision to the existing recent-primary-authentication/MFA transaction confirmation. Mutation requires an operation key. A single transaction locks actor → session → policy, rereads current role/access/enrollment/session authority, and rechecks expiry/assurance after any wait. Authority locks last through commit. Revocations that win the authority lock reject the mutation; revocations arriving after those locks serialize after it. Idempotent replay revalidates authority too.

The policy row, chained security audit, confirmation consumption and operation receipt commit together. Audit records actor/session, reason, before/after policy including exact scopes, revision and contract version. Same actor/key and payload replay the committed response; changed payload conflicts. An unrelated retry key with an old revision fails. Audit or receipt failure rolls back policy and confirmation consumption. The receipt actor reference is an approved safe cleanup inventory source; reviewed account-deletion selection still applies. Operation receipts cascade on actor deletion, matching existing idempotency storage; the audit follows its existing retention/anonymization policy.

## Requested versus effective state

Admins may save a requested Private shadow policy for selected locations, but **effective inference stays Off**. The current server facts are caller not integrated, producer not ready and private-shadow approval missing. The operational producer always returns `not_ready`; tracking, writer coverage, reconciliation and complete coherent inventory must eventually be part of authenticated producer readiness, rather than editable controller flags. The deterministic candidate is `resource-service-start-shadow-v1`, targeting actual service start. No remote provider or learned serving model is connected.

Resource capture is separately shown as not integrated, with privacy approval not recorded. The controller supplies no capture toggle and leaves existing baseline capture unchanged. Turning inference Off does not delete samples, cancel tickets, alter queue ordering, release allocations or change reservations. Forecast support, latency, errors and last evidence are explicitly not collected, not zero-valued performance claims. Only sanitized status and scope metadata are exposed; no customer identities, raw inventory or artifact paths are returned.

## Future serving contract

`platformAiInferenceService.createBoundary({ authorize })` binds a trusted server-owned scope authorizer. Both admission and acceptance require it; numeric tenant/location syntax is not authorization. The callback must enforce the caller's current scope and source binding, and hold compatible authority locks through the acceptance/publication transaction. This internal service has no public inference endpoint and no live caller is wired.

1. `admit(scope)` rereads database policy without a process-local cache. Disabled, unselected or unready scopes are denied.
2. A future caller must also validate authorized queue/source binding, target work identity, queue/resource revisions, supported plans, snapshot bytes, freshness and inference deadline through the existing reviewed wrapper. The policy decision is not an authentication credential or proof of snapshot validity.
3. Before persisting an accepted result or publishing/delivering a cached forecast, call `accept(admission, transactionClient)` inside the same publication transaction. It takes a policy `FOR SHARE` lock and rechecks current authority, effective gates, revision, scope, target and predictor version. Today it always rejects because integration/readiness/approval are absent.
4. Hold that transaction through publication to serialize with policy `FOR UPDATE`. A disable committed first rejects stale/in-flight decisions; a publication that already holds the lock commits before the disable. No subsequent side effect may escape that transaction. An external provider/capture queue needs a separately reviewed outbox/fencing contract before integration.
5. Every policy edit, including scope or parameter changes, increments the global revision. Cache keys and delivery checks must include that revision plus exact trusted scope/target and operational revisions. A result from an old revision cannot become acceptable again after re-enabling. Cross-process readers must use the authoritative database, not a TTL-only policy cache.

The immutable missing-integration facts may only be replaced by reviewed runtime evidence wiring. Capture requires approved privacy assessment and implemented notice/access/retention/deletion/key controls under Stage C. Customer delivery additionally needs target-specific evaluation, measured budgets, labels/same-target fallback, eligible scopes and human rollout approval. Enabling requested policy supplies none of these approvals.

## Verification

Focused unit tests cover bounds, mode restrictions, pilot identity, global override and stale/cross-scope result rejection. Disposable PostgreSQL tests exercise real migrations, atomic receipts/audit/confirmation, authority contention and replay denial, revision conflicts, and disable/publication locks while operational rows remain unchanged. Route tests verify permission denial and cache posture. Platform UI verification covers loading/error/read-only states, navigation, mobile forms and confirmation/retry behavior separately from live inference activation.
