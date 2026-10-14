# Interactive subscription suspension ordering

## Scope and prerequisites

Source baseline: `64d6f4f3f44ce6851135b984645fd0103ef03ab8`, the verified deployment of provider activation ordering in PR #431. This slice covers the Platform subscription suspension handler, only the `subscription.suspend` preview action, and standalone/prepared-client suspension service calls.

The production caller inventory found the selected Platform handler. Two integration-test calls also supplied clients; one intentionally modeled a subscription-first legacy writer. Those cases now distinguish prepared suspension from explicit legacy publisher contention.

Transition requests, immediate/scheduled transition execution, Free assignment/renewal, credit fulfillment, overrides, other preview actions, direct moves and operational scripts remain separate protocol work. Blocking staff invitation entitlement reads remain disconnected.

## Contract

- The outer suspension transaction calls `prepareSubscriptionSuspension` before locked preview or confirmation consumption. Preparation first locates the subscription without a child lock, locks its exact tenant with `FOR UPDATE`, then re-reads the subscription with `FOR UPDATE NOWAIT`.
- Preparation rejects a changed tenant mapping with `409 SUBSCRIPTION_SCOPE_CHANGED`; it never follows a newly discovered tenant behind a held child lock. Missing subscription/tenant returns no context and causes no confirmation consumption or mutation.
- Preparation returns an opaque context. A caller-owned mutation must supply that context, bound privately to the same client, target and actor identity. Unprepared, forged, wrong-client, wrong-target, wrong-actor or consumed contexts fail with `409 SUSPENSION_CONTEXT_REQUIRED` before SQL. Successful binding consumes the context; mutation re-reads current row state and verifies the held tenant mapping.
- Actor-bearing preparation takes `FOR SHARE NOWAIT` on the exact current user before confirmation consumption. Missing/deletion-requested accounts fail with 401; suspended access fails with 403. The Platform handler also validates the current locked roles against `platform.subscription_lifecycle.manage`. Mutation revalidates that held actor before transition writes. Null/system actors remain supported only for internal standalone/prepared calls; the Platform preparation requires an actor.
- Only `55P03` at that known actor read becomes `409 SUBSCRIPTION_ACTOR_BUSY`, escaping the transaction for rollback. This avoids the concrete deletion user-UPDATE → queue-event tenant-FK cycle when suspension already holds tenant UPDATE. A committed deletion invalidates a retry rather than trusting the earlier request user snapshot.
- Standalone suspension owns its transaction and prepares its context inside it. The Platform handler supplies its already prepared context on the same transaction client.
- The selected suspension preview retains exactly its previous public state fields and revision derivation, while its locked subscription read uses `NOWAIT`. No other preview action changes its locking behavior.
- Only `55P03` from the known subscription `NOWAIT` read becomes `409 SUBSCRIPTION_BUSY`. The exception escapes the transaction wrapper; rollback releases the parent and reverses confirmation/transition/status writes before a retry response. Other errors retain their identity.
- Preserve the active-only guard, already-suspended no-op, transition type/status/reason/actor and metadata, existing Platform permission/release/idempotency gates, recent assurance and confirmation revision/payload checks. A retry retains the original preview; stale previews require a new review rather than automatic rebasing.

`prepareSubscriptionSuspension` is an internal entrypoint with a supplied transaction client. Its caller must invoke it before child/confirmation locks. The opaque context verifies binding, not the entire prior lock history or arbitrary transaction isolation settings. No request body can supply a valid context. The sole production caller is audited at its outer transaction boundary.

## Verification and limits

Automated coverage exercises real suspension, preview and privileged-confirmation repository/services against loopback-only PostgreSQL, plus the selected actual Platform handler with middleware registration contracts. Permission, release and idempotency middleware remain stubbed for this isolated handler test; it does not establish live HTTP/RBAC or payment acceptance.

Required cases include confirmation/status/transition commit and fault rollback, fresh already-suspended confirmation, stale original preview, recent MFA and inactive-state rejection, legacy subscription-held tenant-FK contention and retry for both entrypoints, post-wait mapping/status, opaque client/target/actor context binding/reuse, current actor deletion/access/permission rejection, both commit orders against the deletion user/queue-event FK edge, system actor compatibility, missing targets, provider activation contention and adjacent BIGINT subscription/tenant identities.

The legacy resource-policy test intentionally uses an explicit old publisher simulation after verifying that the new service rejects its unprepared client. It must not be described as the new suspension path's ordering.

This is a bounded coexistence prerequisite. It does not certify remaining publishers or preview/plan authority, mark writer coverage complete, enable resource tracking/private capture, change customer estimates or approve AI rollout. Synthetic database tests never establish representative production prediction performance.

Related: [provider activation prerequisite](subscription-activation-ordering.md), [AI Wait-Time Prediction PRD](ai-wait-time-prediction-prd.md).

The deletion contention fixture uses the exact user-lock and queue-event tenant-FK edge from account deletion; it does not invoke the complete deletion endpoint or certify every session/grant/account-deletion writer. Actor locking is bounded to the selected suspension path.
