# GetPrio V1 Stability Status Tracker

This tracker summarizes the current state of the v1 stability PRDs in one place.
It is intentionally concise and should be updated as the implementation work moves.

## Status Key

- `Done` = the PRD scope is effectively complete for v1
- `Mostly Complete` = the core scope is implemented, with only follow-on polish or edge-case work left
- `Partial` = meaningful implementation exists, but some scope remains open
- `Pending` = the PRD is still mostly planned work

## Tracker

| PRD | Status | Notes |
| --- | --- | --- |
| Auth / Session / RBAC | Partial | Core auth/session/RBAC foundation is in place, but MFA, cookie transport, CSRF, and logout-all are still open. |
| Queue Lifecycle | Partial | Lifecycle rules, close/reopen, carry-over, recovery handling, and major tests are in place, but broader edge-case and replay coverage remains. |
| Customer / Public Flow | Mostly Complete | Public/customer flow hardening plus customer account reuse parity is in place, and only follow-on stabilization items remain. |
| Vendor Operations | Partial | Vendor dashboard and operational flows exist, but role boundaries, configuration, and operational polish still need completion. |
| Payments / Billing | Partial | Queue-join payment handling is hardened, but subscription billing and reconciliation are still open. |
| Data Integrity / Observability | Partial | Audit and integrity foundations exist, but broader observability and reconciliation work remain. |
| High-Risk Test Coverage | Partial | Focused backend coverage exists for auth, queue, and customer/public flow, but broader end-to-end and vendor-operations coverage remains. |

## Source PRDs

- [Priority Index](/Users/carloabella/Projects/getprio/dev/docs/plan/v1-stability-priority-index.md)
- [Auth / Session / RBAC](/Users/carloabella/Projects/getprio/dev/docs/plan/auth-session-rbac-v1-stability-prd.md)
- [Queue Lifecycle](/Users/carloabella/Projects/getprio/dev/docs/plan/queue-lifecycle-v1-stability-prd.md)
- [Customer / Public Flow](/Users/carloabella/Projects/getprio/dev/docs/plan/customer-public-flow-v1-stability-prd.md)
- [Vendor Operations](/Users/carloabella/Projects/getprio/dev/docs/plan/vendor-operations-v1-stability-prd.md)
- [Payments / Billing](/Users/carloabella/Projects/getprio/dev/docs/plan/payments-billing-v1-stability-prd.md)
- [Data Integrity / Observability](/Users/carloabella/Projects/getprio/dev/docs/plan/data-integrity-observability-v1-stability-prd.md)
- [High-Risk Test Coverage](/Users/carloabella/Projects/getprio/dev/docs/plan/high-risk-test-coverage-v1-prd.md)

## Recommended Reading Order

1. Start with the priority index.
2. Read the PRD that matches the current branch.
3. Use this tracker for a quick snapshot, not as the primary source of requirements.
