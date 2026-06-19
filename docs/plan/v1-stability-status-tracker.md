# GetPrio V1 Stability Status Tracker

This tracker summarizes the current state of the v1 stability PRDs in one place.
It is intentionally concise and should be updated as the implementation work moves.

## Status Key

- `Done` = the PRD scope is effectively complete for v1
- `Partial` = meaningful implementation exists, but some scope remains open
- `Pending` = the PRD is still mostly planned work

## Tracker

| PRD | Status | Notes |
| --- | --- | --- |
| Auth / Session / RBAC | Partial | Core auth/session/RBAC foundation is implemented, but MFA, cookie transport, CSRF, and logout-all are still open. |
| Queue Lifecycle | Partial | Lifecycle rules, close/reopen, carry-over, and major tests are in place, but some edge-case and recovery work remains. |
| Customer / Public Flow | Partial | Public/customer flow hardening plus customer account reuse parity is in place, but a few cleanup items remain before the PRD is complete. |
| Vendor Operations | Partial | Vendor dashboard and operational flows exist, but the PRD still calls for completeness work around role boundaries, configuration, and operational polish. |
| Payments / Billing | Partial | Queue-join payment handling is hardened, but subscription billing and broader reconciliation are still open. |
| Data Integrity / Observability | Pending | Integrity and logging requirements are defined, but the PRD still needs broader observability and reconciliation work. |
| High-Risk Test Coverage | Partial | Focused backend coverage exists, but the PRD still needs broader end-to-end and vendor-operations coverage. |

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
