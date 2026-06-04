# GetPrio V1 Stability Priority Index

This index tracks the v1 stabilization PRDs created for the current priority set.

## PRDs

- [Auth / Session / RBAC V1 Stability PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/auth-session-rbac-v1-stability-prd.md)
- [Queue Lifecycle V1 Stability PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/queue-lifecycle-v1-stability-prd.md)
- [Vendor Operations V1 Stability PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/vendor-operations-v1-stability-prd.md)
- [Customer / Public Flow V1 Stability PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/customer-public-flow-v1-stability-prd.md)
- [Data Integrity / Observability V1 Stability PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/data-integrity-observability-v1-stability-prd.md)
- [Payments / Billing V1 Stability PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/payments-billing-v1-stability-prd.md)
- [High-Risk Test Coverage V1 PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/high-risk-test-coverage-v1-prd.md)

## Recommended Build Order

1. Auth / Session / RBAC
2. Queue Lifecycle
3. Customer / Public Flow
4. Vendor Operations
5. Payments / Billing
6. Data Integrity / Observability
7. High-Risk Test Coverage

## Note

This order is dependency-aware, not strictly chronological. Some observability and test work should begin alongside earlier implementation phases rather than only at the end.
