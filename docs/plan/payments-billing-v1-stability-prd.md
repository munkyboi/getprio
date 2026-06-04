# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Payment and billing reliability
```

The goal is to make queue-join payments, vendor subscription billing, and webhook-driven activation reliable enough for daily use and supportability.

---

## 1. Product Context

GetPrio has two billing-adjacent domains:

1. queue join payments
2. vendor subscription billing

Both depend on external provider state and both can fail in ways that confuse users and operators if not handled carefully.

---

## 2. Problem Statement

The codebase already supports:

- PayMongo-based queue join checkout
- subscription checkout sessions
- webhook routes
- local fallback billing mode in some cases

The remaining risk is reliability:

- provider success and local activation can drift
- retries can duplicate effects
- cancelled or pending checkouts can leave unclear UI states
- vendor entitlements may not always map cleanly to product restrictions
- platform admin visibility must be trustworthy

---

## 3. Objectives

### Primary Objective

Stabilize money-adjacent flows so billing state reliably controls product access and queue activation.

### Secondary Objectives

- ensure external provider events are safely reconciled
- avoid ghost paid states or ghost unpaid states
- make billing limits visible enough to explain product restrictions

### Non-Objectives

- advanced invoicing
- tax/VAT automation
- multiple PSP support in v1
- revenue analytics beyond operational reporting

---

## 4. Billing Domains

## 4.1 Queue Join Payments

Used to gate ticket activation for certain queue joins.

## 4.2 Vendor Subscription Billing

Used to control tenant entitlements such as:

- locations
- staff seats
- queue volume
- queue settings
- analytics/export access

---

## 5. Queue Join Payment Requirements

Stable v1 queue-join payment flow must support:

- payment session creation
- payment status persistence
- successful ticket activation after payment
- safe cancellation return path
- manual/status refresh when needed
- platform visibility into records

### Activation Rule

Paid queue join must activate exactly one ticket.

### Failure Rule

Cancelled or unpaid checkout must not activate a ticket.

### Reconciliation Rule

If payment succeeds but activation fails or is delayed, the system must support deterministic replay/recovery.

---

## 6. Subscription Billing Requirements

Stable v1 subscription flow must support:

- plan selection
- checkout initiation
- provider session tracking
- payment success sync
- subscription state updates
- entitlement derivation from active subscription

### Entitlement Rule

Tenant feature access must be derived from active subscription state, not just optimistic frontend assumptions.

### Graceful Degradation

If subscription is inactive or unpaid:

- tenant should still see billing state
- restricted actions should fail cleanly with actionable messaging

---

## 7. Webhook Reliability

Webhook handling is critical for both queue join payments and subscription updates.

Requirements:

- signature verification where supported
- event persistence/audit
- idempotent processing
- replay-safe updates
- failure logging

### Webhook Processing Rule

Provider events must not directly cause duplicate ticket activations or duplicate subscription records.

---

## 8. Payment State Model

Queue join payments should have stable statuses such as:

- `pending`
- `paid`
- `cancelled`
- `failed`
- `expired`

Subscription checkout sessions should have stable statuses reflecting:

- created
- pending
- paid
- cancelled
- failed

Tenant subscriptions should have stable statuses such as:

- `active`
- `unpaid`
- `past_due`
- `canceled`
- `expired`

### Rule

State transitions must be explicit and one-way where appropriate.

---

## 9. Reconciliation Requirements

Stable v1 needs a reconciliation path for:

- paid queue join payment with no active ticket
- active ticket with missing payment linkage where payment was required
- paid subscription checkout with no active tenant subscription
- stale pending sessions that should be refreshed or marked terminal

### Operational Requirement

Platform admin and support workflows must be able to inspect these mismatches.

---

## 10. Access Control Requirements

### Customer/Public Side

- only sees own queue-join payment state or safe join outcome state

### Vendor Side

- vendor admin/owner can see tenant billing overview and status
- vendor staff should not manage billing

### Platform Side

- platform admin can inspect all queue join payments, subscriptions, and billing events

---

## 11. API Requirements

Stable billing API areas:

```txt
queue join payment initiation
queue join payment status sync
subscription checkout creation
subscription checkout sync
billing overview
queue join payment admin listing
subscription admin listing
billing events admin listing
provider webhook endpoints
```

### API Rule

Payment APIs must always expose enough identifiers to trace provider state to local records.

---

## 12. Data Requirements

Stable v1 billing data must preserve:

- provider checkout session id
- provider payment id where available
- tenant id
- otp or join correlation
- ticket id once activated
- metadata for reconciliation

Recommended additions if missing:

- explicit provider event log / webhook audit
- last sync attempt timestamp
- failure reason metadata

---

## 13. UX Requirements

Customer-facing:

- clear payment required state
- clear success/cancelled outcome
- no ambiguous “maybe joined” state

Vendor-facing:

- clear subscription status
- clear entitlements affecting operations
- clear next step if plan limits block actions

Platform-facing:

- inspectable billing event and payment records

---

## 14. Acceptance Criteria

- paid queue join activates one and only one ticket
- unpaid/cancelled queue join does not activate a ticket
- subscription payment updates tenant subscription state correctly
- feature restrictions follow active entitlements consistently
- webhook replays do not duplicate effects
- platform admin can diagnose payment and billing failures from stored records

---

## 15. Recommended Implementation Order

### Phase 1

- audit status models and idempotency rules
- standardize queue-join activation contract

### Phase 2

- harden webhook processing and audit logging

### Phase 3

- add reconciliation flows for mismatched paid/pending states

### Phase 4

- tighten entitlement enforcement and vendor-facing billing messaging

---

## 16. Final Recommendation

Treat payments and subscriptions as state machines with reconciliation, not just checkout redirects.

That is the minimum needed to keep queue access, vendor plan limits, and platform oversight consistent.
