# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Data integrity and observability
```

The goal is to make GetPrio diagnosable, auditable, and resistant to silent state corruption as queue, auth, payment, and notification features grow.

---

## 1. Problem Statement

The platform already stores operational data across tickets, memberships, billing, OTPs, themes, and notifications. The risk is not absence of data. The risk is:

- inconsistent writes across complex flows
- weak auditability for state-changing actions
- limited ability to trace failures across modules
- insufficient operational visibility when something breaks in production-like use

Stable v1 needs data integrity rules plus observability standards.

---

## 2. Objectives

### Primary Objective

Ensure that business-critical state changes are correct, traceable, and diagnosable.

### Secondary Objectives

- reduce silent failure modes
- improve post-incident debugging
- support future reporting and ETA work with trustworthy operational data

### Non-Objectives

- full enterprise observability stack
- distributed tracing across many services
- SIEM-grade security analytics

---

## 3. Integrity Domains

Stable v1 integrity work covers:

- auth/session events
- queue mutations
- payment and billing state
- OTP verification
- notifications
- staff invitation state

Each domain must have:

- authoritative current state
- append-only or reconstructable event trail for critical changes
- validation rules
- failure logging

---

## 4. Core Integrity Principles

### Principle 1

Critical state changes must be transactional where possible.

### Principle 2

Current state and event history must not contradict each other.

### Principle 3

Externally triggered updates such as webhooks must be idempotent.

### Principle 4

Operational failures must be loggable with enough context to debug without exposing secrets.

---

## 5. Required Event/Audit Coverage

Stable v1 must log security or operational events for:

- login success/failure
- queue lifecycle changes
- queue-day closure/reopen
- OTP request and verification outcomes
- payment session creation
- payment confirmation / reconciliation
- notification send success/failure
- staff invite creation / acceptance / revocation
- billing checkout and webhook processing

Event storage can be domain-specific rather than forced into one giant table, but high-risk domains need explicit audit coverage.

---

## 6. Data Validation Requirements

### Input Validation

All write paths must validate:

- type
- format
- required/optional rules
- ownership or tenant scope
- status preconditions

### Persistence Validation

Use database constraints where possible for:

- uniqueness
- enum-like status checks
- foreign key integrity
- not-null business rules

### Output Validation

Shared formatters should define stable response shapes for tickets, users, payments, and snapshots.

---

## 7. Transaction Rules

Use DB transactions for:

- vendor registration
- queue join activation
- queue lifecycle mutations
- queue-day closure/reopen
- payment-to-ticket activation transitions
- membership creation with related side effects

### Rule

If a flow performs more than one business-critical write, it must be evaluated for transactional grouping.

---

## 8. Idempotency Requirements

Stable v1 must explicitly support idempotency for:

- payment webhook handling
- queue join activation after payment
- queue snapshot publish after repeat-safe mutations
- invitation acceptance retry
- password reset confirmation if introduced from auth PRD

Recommended mechanisms:

- unique external provider ids
- status guards
- idempotency keys where needed
- replay-safe update logic

---

## 9. Logging Requirements

### Application Logs

Structured logs should include:

- event name
- module
- actor or system source
- tenant id if relevant
- location id if relevant
- ticket id or payment id if relevant
- result status
- error category

### Logging Rules

- do not log plaintext secrets
- do not log full tokens, OTP codes, or card/payment secrets
- redact PII where not operationally necessary

---

## 10. Monitoring and Alerting Requirements

Stable v1 should at minimum surface alerts or dashboards for:

- repeated login failures / lockouts
- queue mutation failures
- webhook processing failures
- notification send failures above threshold
- payment activation mismatches
- DB connection or migration issues

This can begin as app logs + admin dashboard visibility rather than a full monitoring platform.

---

## 11. Data Reconciliation Needs

Stable v1 must support manual or scheduled reconciliation for:

- queue join payments vs activated tickets
- billing checkout sessions vs tenant subscriptions
- invitations pending vs membership state
- notifications attempted vs persisted status

### Rule

Whenever external systems are involved, reconciliation must be possible from stored data.

---

## 12. Schema Recommendations

Recommended additions or standardizations:

- queue lifecycle event table
- auth security/session events
- webhook processing audit table if not already explicit
- failure metadata fields on payment and notification records where helpful

Also review indexes for:

- ticket lookup code
- queue-day scoped ticket queries
- provider checkout ids
- invitation token hash
- OTP ids and expiry queries

---

## 13. Operational Tooling Requirements

Platform admin or engineering support should be able to answer:

- why a ticket is in its current state
- whether a payment created a ticket
- why a user could not log in
- whether an OTP was requested, expired, or used
- whether a notification was attempted and failed

This does not require a full support console in v1, but the data model must support answering these questions.

---

## 14. Acceptance Criteria

- high-risk mutations are transactional
- webhook and payment activation flows are idempotent
- queue state changes are auditable
- logs contain enough context to debug without exposing secrets
- operational failures leave evidence, not just user-facing errors

---

## 15. Recommended Implementation Order

### Phase 1

- identify critical write paths
- standardize transactions and status guards

### Phase 2

- add missing event/audit tables
- improve structured logging

### Phase 3

- add reconciliation views/jobs for payment and queue activation mismatches

### Phase 4

- add admin-facing operational diagnostics where needed

---

## 16. Final Recommendation

Do not wait for “production scale” to add observability discipline.

Stable v1 requires enough integrity and logging to explain failures in auth, queue, payment, and notification flows without guessing from partial records.
