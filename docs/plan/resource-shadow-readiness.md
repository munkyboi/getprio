# Resource shadow integration readiness

## Current boundary

PR #314's fixed synthetic comparison was reproduced on the deployed droplet. Resource reference errors were 4.75, 3.57, 6.03 and 60.71 minutes for sequential, parallel, competing and disrupted scenarios. These are simulator results, not operational accuracy. No synthetic artifact is activated in production.

Current runtime sources provide draft pool configuration, immutable ticket service plans and staff service timing observations. They do not provide an authoritative resource allocation ledger. Calling a ticket allocates nothing. Timing `interrupted` currently ends the timing observation; it must not be translated into the simulator's resumable interruption state. Expected end times must never imply a resource release.

## Read-only operator audit

The existing `scripts/resource-capacity-audit.mjs` now adds `shadowReadiness`. Use the same required vendor/location and UTC reservation window options. It runs inside the audit's repeatable-read, read-only transaction, with its existing expected database checks and timeouts. No API, schema migration, allocation, historical rewrite, customer estimate or model activation is added.

The new inventory independently includes **all** waiting/called tickets and unfinished service observations at the selected location across queue dates. The reservation window and baseline queue-date count retain their original meanings. Counts therefore need not match the dashboard's current-day waiting count. The report returns aggregate counts only, excluding customer identities and raw ticket IDs. More than 10,000 inventory tickets fails the report rather than silently truncating it.

`planIssueTicketCounts` counts each reason once per ticket. Reasons may overlap:

- `missing_service_plan`: no populated immutable plan.
- `invalid_plan_item` or `invalid_duration`: unusable stored item/duration.
- `missing_resource_mapping`: unknown captured resource, absent current requirement or absent pool.
- `invalid_resource_demand`: invalid captured units or units exceeding pool capacity.
- `stale_resource_snapshot`: captured pool/requirement revision, pool ID or units differ from configuration. This diagnoses drift; it does not overwrite or reconcile the plan.
- `unsupported_execution_mode`: sequential or unknown execution needs a stage-aware adapter; it cannot be flattened into a simultaneous bundle.
- `parallel_demand_exceeds_capacity`: summed simultaneous item demand exceeds a pool. Duration/quantity semantics remain those of the captured plan; this audit never multiplies elapsed duration by units.

`ticketsWithoutPlanIssues` means only that these inventory checks found no issues. It does not establish complete mappings for all future work, resource availability, reservation feasibility, dispatch order or training eligibility. Unfinished timing counts are observations, not occupied-resource counts. Even with zero tickets/issues, `readyForShadowProjection` and `authoritativeOccupancyAvailable` remain false. A missing plan table is reported explicitly. Missing resource foundation tables retain the existing audit's early unavailable response.

## Contract required from vendor runtime work

The multidimensional queue work owns the authoritative allocation/occupancy lifecycle. Before an AI-side adapter is connected, agree on a scoped internal snapshot with:

1. Vendor/location identity, database observation timestamp, contract version and coherent snapshot revision. Read pool configuration, plans, allocations and reservations under a consistent transaction. Reject incomplete/truncated snapshots and cross-scope references.
2. Configured capacities and revisions, allocation units per pool, explicit start and release events, operational pause state, and observed interruption/resumption semantics. Include active sessions even when their queue ticket is terminal or from a previous queue day. Overdue sessions retain allocation; a configured or expected end is never a release.
3. Every relevant issued service plan, execution stages, server-defined priority/order, earliest call eligibility and service readiness. Unknown plans must block affected projections rather than imply zero demand. Include walk-in, QR/mobile and booking tickets with equal rules.
4. Protected reservation intervals and authoritative allocation/reservation identity links for de-duplication. Include pending holds according to runtime expiry rules. Bound the projection horizon explicitly. Walk-in duration must fit around protected reservations; the simulator reference currently has no such protection.
5. Separate targets: existing prediction-to-call baseline versus prediction-to-actual-service-start resource projection. Capture paired observations/versioned inputs for each target; do not score them against interchangeable outcomes.
6. Explicit unavailable reasons for incomplete plans, stale/reconciled mappings, unknown occupancy, overdue occupancy, paused operations, unbounded resumption or incompatible stages/order. Never copy the simulator's one-minute overrun heuristic into operational inference.

The AI workstream owns snapshot validation, a separate reservation-aware shadow predictor, bounded execution, private paired capture and evaluation after the runtime contract lands. It must not call `synthetic-resource-reference-v1` with production records. No public estimate or confidence interval is published by this slice. Publication, uncertainty calibration and trained-model promotion require separately reviewed evidence.

## Verification status

Authoring checks: Node syntax, focused ESLint and whitespace validation. No local tests or database audit were run in this slice. Hosted checks and execution against the operator's database are separate gates. The user should run the existing capacity audit after deployment and review `shadowReadiness` before any runtime shadow integration is enabled.

The next internal consumer boundary is documented in [Resource snapshot consumer](resource-snapshot-consumer.md). It has no live producer or inference hook.
