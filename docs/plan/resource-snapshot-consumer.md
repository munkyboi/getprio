# Resource operational snapshot consumer

## Delivered boundary

`backend/src/services/resourceOperationalSnapshot.js` adds a standalone internal byte decoder and semantic validator for the runtime workstream's proposed `resource-operational-snapshot-v1` contract. The supplied proposal is preserved in [the reference schema](../contracts/resource-operational-snapshot-v1.proposed.schema.json). The validator is hand-written for this one contract; it does not execute arbitrary JSON Schema or require a new dependency.

No API, producer, allocation ledger, prediction, capture hook or customer output imports this module. Deployment alone cannot activate it. The current runtime still has no authoritative ledger and must eventually emit `not_ready`, not a ready snapshot manufactured from an empty queue or service timing.

The scope is a resource-only ordinary vendor location queue with one executable service item and one pool per work unit. Developer queues, workflow stations, multi-item/sequential bundles and learned/synthetic artifacts are unsupported. The reference schema remains a proposal until the owning runtime implementation is reviewed against it.

## Consumer API

`validateResourceOperationalSnapshot(bytes, { expectedScope, nowMs, forecastUntilMs, maximumAgeMs })` returns an independently parsed, deeply frozen envelope or throws a stable diagnostic error. It never forecasts or modifies its input.

- `bytes` must be a Buffer of at most 2 MiB from an authorized internal producer. UTF-8 decoding is fatal on malformed bytes; a BOM is preserved and rejected by JSON parsing rather than silently removed. Do not accept snapshots, source bindings or trusted-clock options from customer/browser requests.
- `expectedScope` contains exact `tenantId`, `locationId`, `queueKind: "location"` and an independently configured opaque `sourceBinding`. All four fields must match. Source binding contains no credentials and is not evidence of provenance or authorization by itself.
- `nowMs` comes from a trusted server clock at consumption. `forecastUntilMs` is a later requested horizon. Snapshot window must cover the observation and extend through the requested horizon.
- `maximumAgeMs` is explicitly configured from 1–5000 ms, reflecting the initial handoff's proposed five-second ceiling. No consumer cache may extend this budget. Integration load/clock tests remain required; this proposal is not a measured latency guarantee.
- Both branches require exact fields, version and scope. `not_ready` requires null snapshot and unique allowlisted reasons. It returns that frozen diagnostic envelope, never empty allocations. The caller must inspect readiness before invoking any future predictor.

Ready snapshots must have explicit complete inventory/writer coverage declarations, coherent revision tokens, canonical UTC timestamps, positive bounded pool capacity/demand, supported states and execution mode, and bounded collections (100 pools, 10,000 allocations/work entries, 20,000 protected reservations). Database IDs/revisions fit positive PostgreSQL bigint. Service duration is an integer from 5 through 480 minutes, matching the vendor-service domain; longer composed plans need a separately agreed bounded contract rather than arbitrary numbers. Unknown or extra properties fail validation rather than bypassing the contract.

Semantic checks reject duplicate identities, unknown pools, units above capacity, actual over-allocation, protected reservation overlap above capacity and invalid intervals. Every allocation maps to exactly one In service work item with matching pool/demand/reservation identity; every In service item has its allocation. Waiting/Called consumes no actual units. Session/work/allocation references are unique. Converted reservation references cannot also appear as protected reservations or convert twice. Waiting/Called reservation references resolve with matching demand; one protected binding cannot be claimed by two work items. Pending order keys are unique and equal-width; their priority/arrival meaning is a producer guarantee, not reconstructed client-side.

The frozen plan revision and scoped configuration watermark are validated structurally. The producer must prove their coherence, reconciliation, source completeness and writer coverage through authoritative records. No declaration, source binding or shape check alone proves those facts. Array bounds and byte limits deliberately fail instead of truncating.

## Inventory validity versus forecast support

An active allocation can truthfully have null expected end, a past expected end or unresolved state. The validator retains that allocation; it does not auto-release it or assume a one-minute residual. A future predictor must reject unsupported unknown/overdue/unresolved completion and diagnose unavailable service start. Intake pause is kept as intake state; it must not silently be equated with paused service dispatch.

Protected reservations here are the unconverted ledger bindings overlapping the reported window. Actual allocations remain complete across queue dates. Protected interval overlap is validated independently of forecast allocation intervals: expected end is not actual release. A reservation-aware predictor must separately reason about their joint forecast and return unavailable on conflicts/unknown completion, including service intervals crossing the reported horizon.

`readiness: ready` means validated authoritative-inventory shape and consistency, not forecast support, physical availability or rollout approval. Time-to-call baseline labels remain distinct from future actual-service-start evaluation. No operational prediction or confidence interval is produced by this module.

## Integration sequence

1. Runtime implements shared reservation/allocation locking, immutable binding lifecycle and complete writer coverage, with tracking disabled during foundation work.
2. Review the producer against this agreed contract and validate coherent reads, scope, source binding, freshness and races in an isolated database.
3. Add a separate pure reservation-aware shadow predictor and bounded internal provider integration. Unsupported inputs retain the existing baseline and private diagnostic.
4. Pair service-start targets with explicit actual start outcomes; evaluate before any public estimate change. Synthetic scenarios remain separate evidence.

## Verification

Node syntax, focused ESLint and git diff whitespace checks passed. No local tests, database operations or schema-validator execution were run. Hosted checks and future producer/concurrency/runtime acceptance remain separate. The operator's PR #315 audit succeeded on 7 October 2026 with one disabled Courts pool, four mappings and zero current inventory; this verifies the audit path, not occupancy readiness.
