# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Basic high-risk test coverage
```

The goal is not broad test vanity coverage. The goal is targeted coverage for the flows most likely to break product trust or security.

---

## 1. Problem Statement

GetPrio already spans multiple high-risk domains:

- auth and RBAC
- queue lifecycle
- public/customer queue join
- payment-webhook activation
- vendor operational actions

Without focused test coverage, regressions will accumulate fastest in exactly the flows that are hardest to manually verify repeatedly.

---

## 2. Objectives

### Primary Objective

Add targeted automated test coverage for the highest-risk business flows in v1.

### Secondary Objectives

- reduce regression risk during stabilization work
- make lifecycle and permission rules executable
- support safer refactors in auth, queue logic, and payments

### Non-Objectives

- 100% coverage
- snapshot-heavy UI test suite
- exhaustive visual regression setup

---

## 3. Coverage Priorities

Stable v1 test investment should focus on:

1. auth/session/RBAC
2. queue lifecycle correctness
3. customer/public join flow
4. payment and billing state transitions
5. critical vendor operational workflows

---

## 4. Test Pyramid Recommendation

Preferred mix:

- service/repository tests for business rules
- route/integration tests for end-to-end API contracts
- a small number of browser-level tests for highest-risk user flows

### Rule

Do not over-invest in brittle UI-only tests for behavior that should be verified at service and API levels.

---

## 5. Auth and RBAC Test Requirements

Cover:

- customer registration
- vendor registration
- login success/failure
- lockout/rate-limit behavior once implemented
- `/me` authenticated behavior
- platform admin route protection
- tenant owner/admin/staff route protection
- unauthorized tenant access rejection

### Key Assertions

- generic invalid-credential response
- forbidden routes stay forbidden
- membership role determines access

---

## 6. Queue Lifecycle Test Requirements

Cover:

- ticket creation
- unique sequence generation
- call next when queue has waiting tickets
- call next when current called ticket exists
- serve current ticket
- skip current ticket
- cancel waiting ticket
- queue-day close behavior
- reopen behavior
- carry-over / unserved behavior

### Key Assertions

- valid transitions succeed
- invalid transitions fail
- only one active called ticket exists
- queue snapshots match committed state

---

## 7. Customer/Public Flow Test Requirements

Cover:

- public queue load
- guest join without OTP where allowed
- OTP-gated join
- invalid OTP
- payment-required join branching
- ticket lookup
- ticket cancellation
- privacy-safe public board data

### Key Assertions

- join does not create ambiguous partial state
- lookup returns correct ticket status
- public board does not leak sensitive fields

---

## 8. Payment and Billing Test Requirements

Cover:

- queue join checkout session creation
- queue join payment success activation
- queue join cancelled flow
- idempotent payment replay
- subscription checkout creation
- subscription sync success
- webhook replay safety
- entitlement-gated vendor action failure when plan does not allow action

### Key Assertions

- paid queue join activates exactly one ticket
- repeated webhook or sync does not duplicate side effects
- vendor plan state drives access consistently

---

## 9. Vendor Operations Test Requirements

Cover:

- dashboard snapshot retrieval for authorized tenant user
- location-scoped queue operations
- staff invitation creation
- staff seat limit enforcement
- counter CRUD happy path
- location CRUD happy path

### Key Assertions

- tenant scoping is enforced
- owner/admin/staff differences behave correctly

---

## 10. Browser-Level Test Recommendations

Keep browser tests few and high-value.

Recommended scenarios:

- customer register/login
- customer join queue and retrieve ticket
- vendor operator call-next and serve flow
- vendor admin invite staff

These should verify user-visible continuity, not replace service-level correctness tests.

---

## 11. Test Data and Environment

Stable v1 test setup should support:

- deterministic DB seed or isolated fixture creation
- tenant + location baseline fixtures
- customer and vendor role fixtures
- payment provider mocks or local fakes
- notification provider stubs

### Rule

External provider dependencies should be mocked or simulated in automated tests.

---

## 12. Tooling Direction

The exact framework can follow repo preference, but the test suite must support:

- Node/Express integration testing
- DB-backed test isolation
- route and service assertions
- optional browser automation for a few top flows

Potential split:

- backend integration tests
- service/unit tests
- lightweight frontend/browser smoke tests

---

## 13. Acceptance Criteria

- high-risk auth, queue, join, and billing flows have automated coverage
- tests are deterministic enough to run repeatedly in development and CI
- regressions in state transition logic and route authorization are caught automatically
- payment provider behavior can be simulated without live network dependency

---

## 14. Recommended Implementation Order

### Phase 1

- auth/RBAC integration tests
- queue lifecycle service/integration tests

### Phase 2

- join + payment activation integration tests

### Phase 3

- targeted vendor-operations tests
- a few browser-level end-to-end flows

---

## 15. Final Recommendation

Do not chase broad coverage percentages.

For stable v1, the right test suite proves:

- who can do what
- how queue state changes
- how customer joins become tickets
- how payment events become product state
