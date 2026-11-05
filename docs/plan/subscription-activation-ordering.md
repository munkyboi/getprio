# Subscription activation ordering prerequisite

## Scope

This focused prerequisite for the AI authoritative writer plan covers `billingService.syncPayMongoCheckout` and the subscription branch of `handlePayMongoWebhook`. Source baseline: `d9ee0b01fd43fc3c9baba4f01310fdeff96ee43f`.

The staff invitation writer needs stable entitlement reads in its existing tenant transaction. The provider activation path previously held subscription rows before inserting a tenant foreign key. A blocking tenant-held subscription reader could reverse that order. Initial activation with no current subscription also had no row to serialize concurrent callbacks.

## Transaction protocol

1. Fetch provider state outside the synchronization transaction. Webhooks retain signature, mode and channel dispatch checks.
2. Locate the subscription checkout without a child-row lock. This lookup supplies a candidate tenant identity only.
3. Acquire that tenant's `FOR UPDATE` lock on the transaction client before event foreign-key checks or checkout/subscription writes.
4. Re-read the checkout by exact ID using `FOR UPDATE` on that client. Reject changed tenant, plan or provider-checkout mappings with `409 SUBSCRIPTION_CHECKOUT_CHANGED`. Handle a missing checkout/tenant without activating it.
5. Use the freshly read paid state and expected-subscription metadata. Retain duplicate-event, already-paid, missing-checkout and missing-plan outcomes.
6. Acquire current subscription rows with scoped `FOR UPDATE NOWAIT`. Only `55P03` from this acquisition becomes `409 SUBSCRIPTION_BUSY`. Throw through the transaction wrapper so rollback completes before the response. A retry must still satisfy the original expected subscription/plan, restriction and ambiguity guards; expectations are never automatically rebased.
7. Persist payment state, subscription replacement and transition together. A failed write or conflict rolls back the event and paid flag too.

Exact checkout and tenant identities remain strings in the affected repository queries. The locked checkout lookup requires a supplied transaction client. The fail-fast subscription option is used only by these serialized provider entrypoints; other repository callers retain their previous lock behavior.

## Coexistence boundary

Tenant-first provider serialization alone would invert the order of remaining subscription-first lifecycle, credit and privileged-preview writers. `NOWAIT` prevents the provider transaction from waiting on their held subscription rows while retaining its tenant lock. This is a bounded coexistence measure, not certification of the complete lock graph.

Lifecycle request/execution/suspension, upstream locked previews, credit fulfillment, entitlement overrides, operational rollout/seed paths and direct subscription moves remain separate work. Existing policy readers using `NOWAIT` remain unchanged. Plan reads remain ordinary reads; this slice does not establish held plan/default policy authority. Checkout/event uniqueness waits are not generally certified by the subscription contention test.

Blocking invitation entitlement reads remain disconnected. This change does not enable resource tracking, mark writer coverage complete, activate capture/inference or change customer wait estimates.

## Automated verification

The regression suite uses the real billing repository and service with signed synthetic webhooks, stubbed provider HTTP and a loopback-only PostgreSQL schema. Its payment, subscription and transition table definitions come from the current bootstrap SQL. It exercises:

- Concurrent sync/webhook, distinct webhook events and duplicate event delivery for one checkout.
- Distinct checkouts with no current subscription, including two sync callbacks and mixed sync/webhook callbacks: one activation, then expected-revision conflict rather than a second activation.
- Waiting at the tenant serializer before any event write; fresh paid state, reassigned checkout and subscription revision after waiting.
- A legacy transaction holding the subscription and then waiting on a tenant FK insert: both entrypoints fail fast, fully roll back, release the tenant, and can retry after the legacy writer commits.
- Fault rollback, existing-subscription preservation, restricted/ambiguous outcomes, missing checkout/plan and adjacent BIGINT scopes.
- Provider HTTP outside the calling transaction; internal lock options requiring a client and narrowly scoped lock-error translation.

This is synthetic database concurrency evidence. No production payment, vendor mutation, representative prediction performance or live activation acceptance is established.

See [AI Wait-Time Prediction PRD](ai-wait-time-prediction-prd.md) for the complete implementation and rollout gates.
