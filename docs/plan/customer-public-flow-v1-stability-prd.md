# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Public and customer queue flow reliability
```

The goal is to make the customer-facing experience trustworthy from queue entry to ticket lookup, without exposing unsafe data or producing broken queue joins.

---

## 1. Product Context

GetPrio’s highest-frequency user flow is:

```txt
discover queue
join queue
verify join
receive ticket
monitor queue
respond to notifications
optionally cancel
view history if registered
```

If this flow breaks, the product fails even if vendor tools are strong.

---

## 2. Problem Statement

The repo already supports:

- public queue board
- queue join
- OTP-based verification
- CAPTCHA / Turnstile for QR joins
- queue-join payment path
- ticket lookup and cancellation

The remaining risk is reliability and consistency:

- multiple join paths can diverge
- public board and private lookup may show different interpretations
- OTP/payment branching can create partial queue state confusion
- public pages must stay privacy-safe
- queue join failures must not leave broken partial records

---

## 3. Objectives

### Primary Objective

Make the customer/public queue flow stable, privacy-safe, and end-to-end complete for v1.

### Secondary Objectives

- reduce uncertainty after queue join
- ensure safe fallback behavior when queue/payment/OTP conditions fail
- maintain parity between guest and registered-customer experiences where appropriate

### Non-Objectives

- customer ETA layer
- loyalty features
- deep notification preference center
- appointment booking

---

## 4. User Paths In Scope

### Guest

- open public queue page
- view current queue state
- join queue through QR or online link
- complete OTP or payment-gated join
- receive ticket + lookup code
- monitor ticket state
- cancel own waiting ticket if allowed

### Registered Customer

- all guest behaviors where permitted
- optionally reuse saved contact details
- access account and queue history

---

## 5. Public Queue Board Requirements

Stable v1 public board must:

- load reliably by tenant/location URL
- show current serving ticket
- show safe waiting indicators
- reflect open/closed queue-day state
- support optional themed branding
- update live through SSE with safe fallback behavior

### Privacy Rules

Public board must never reveal:

- phone numbers
- email addresses
- private notes
- payment references
- internal staff metadata

Customer names shown publicly must remain masked or otherwise privacy-safe.

---

## 6. Queue Join Requirements

## 6.1 Join Entry Modes

Supported v1 join channels:

- `online`
- `qr`
- `vendor`

Join flow must preserve channel in data and analytics.

## 6.2 Join Validation

Before ticket creation, the system must validate:

- tenant exists and is active
- location exists and is active
- customer joins are allowed for that tenant
- store hours / queue-day open rules allow join
- queue-day is not closed
- security checks pass for required channels
- payment requirements are satisfied before final ticket activation

### Required Inputs

At minimum, the flow must handle:

- customer name
- optional email
- optional phone
- notification preferences
- optional notes where policy allows

Validation must be explicit and not depend on UI-only assumptions.

---

## 6.3 OTP Verification

OTP is part of queue-join assurance, not just a messaging feature.

Requirements:

- OTP issuance for applicable join path
- single-use verification
- expiry enforcement
- generic failure handling where needed
- safe retry behavior

### Stability Rule

A ticket must not become active until OTP requirements are satisfied for OTP-gated joins.

---

## 6.4 Payment-Gated Join

If queue join fee applies:

- do not create a final active ticket before payment confirmation path is valid
- payment session must map deterministically to queue join intent
- post-payment activation must be idempotent
- cancelled or abandoned payment must not create ghost active tickets

---

## 7. Ticket Confirmation and Lookup

After successful join, the user must receive a stable confirmation object containing:

- ticket number
- lookup code
- ticket status
- notification channel flags
- queue snapshot summary

### Lookup Requirements

Lookup by code must:

- resolve only the intended ticket
- show safe current state
- show live position only if ticket is actively waiting in active queue-day
- allow cancellation only if current policy allows

### UX Rule

The customer should not need to infer whether the ticket is active, closed, skipped, or carried over.

---

## 8. Notification Behavior

Stable v1 customer flow must integrate with:

- email notifications
- SMS notifications if configured
- almost-there / called updates where supported

### Rules

- notification preferences must be saved per ticket join
- missing contact data must block incompatible notification selection
- notification failure must not corrupt queue status

---

## 9. Registered Customer Account Behavior

Stable v1 customer account should support:

- profile details
- current account identity
- owned ticket history
- safe reuse of contact data for future joins

### Ownership Rule

Account history must only surface tickets owned by the authenticated user or intentionally linked records.

---

## 10. Failure and Recovery States

Stable v1 must explicitly handle:

- invalid tenant/location URL
- queue closed for today
- location currently closed
- Turnstile/CAPTCHA failure
- OTP expired
- OTP invalid
- payment cancelled
- payment pending
- payment succeeded but activation delayed
- lookup code not found
- ticket already cancelled / already resolved

### Product Rule

Every join failure must leave the system in one of two states:

- no active ticket created
- active ticket created exactly once and clearly retrievable

There must be no ambiguous middle state from the customer perspective.

---

## 11. API Requirements

Stable public/customer API areas:

```txt
GET    public queue snapshot
POST   join OTP request
POST   join OTP verify
POST   queue join finalization
GET    ticket lookup
DELETE ticket cancellation
GET    customer account overview
GET    customer queue history
```

API rules:

- ticket creation and payment activation must be idempotent
- queue join endpoints must return stable payloads consumable by both guest and authenticated flows

---

## 12. Data Requirements

Stable v1 customer/public flow relies on:

- safe ticket ownership semantics
- queue join OTP persistence
- queue join payment persistence
- notification delivery logs

Recommended future-proofing:

- explicit join-attempt correlation id
- explicit ticket/customer linking quality indicator if mixed guest/auth joins remain possible

---

## 13. Acceptance Criteria

- Public queue pages load correctly for tenant/location routes
- Guest and authenticated customers can join queue successfully where allowed
- OTP-gated joins do not activate tickets early
- Payment-gated joins do not create duplicate or ghost tickets
- Ticket lookup always resolves clear state or safe not-found
- Customer cancellation behaves predictably
- Public board exposes only safe data

---

## 14. Recommended Implementation Order

### Phase 1

- Audit public join paths for state consistency
- Standardize join success/failure contracts

### Phase 2

- Harden OTP lifecycle and payment-linked activation

### Phase 3

- Tighten lookup/cancellation behavior and privacy-safe public display rules

### Phase 4

- Complete registered-customer account parity for history and reuse flows

---

## 15. Final Recommendation

Treat the customer/public flow as a transactional product journey, not just a set of pages.

Stable v1 means the user can always answer:

- did my join work
- what is my ticket
- is it still active
- what do I do next
