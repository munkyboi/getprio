# Internal resource source assessment (B1)

`createResourceSourceAssessment({pool, sourceBinding, authorize, ...bounds})` returns `readAssessment({tenantId, locationId, windowFrom, windowTo})`. All configuration comes from trusted server code. Inputs cannot assert source binding, clock, assessment mode, completeness or revisions. Bounds retain the report limits, with at most one dispatch-scope row and 100 configured counters. The window must contain the database observation and span no more than 480 minutes.

The factory is internal-only. There is no Platform/CLI consumer, live diagnostic route, forecast adapter, polling, export, repair, capture, tracking activation or customer estimate change in this slice. A private live integration and authenticated diagnostic read remain pending; deployment alone cannot prove that gate.

## Independent assessment response

The frozen `resource-source-assessment-v1` result contains trusted scope/window, the original database `observedAt` and exact `observedAtMicroseconds`, `completedAt`, scan status, `readiness: not_ready`, `snapshot: null`, `sourceAssessment`, and `reportEvidence`. The latter retains the existing `resource-inventory-reconciliation-report-v1` classification and fields. The ordinary report factory's default response/query surface and the strict accepted producer envelope remain unchanged.

Sources and classified report evidence are collected in the same bounded `REPEATABLE READ READ ONLY` transaction. A separate bounded read-only authorization checkpoint checks current grants before every returned assessment, including row/byte overflow and classified storage/timeout failures. It never refreshes observation or revisions. Denial rejects; checkpoint failure is sanitized. Missing tables/columns and statement/lock timeouts return unavailable evidence only after current authorization. Counts remain null on failed reads. Partial scans never become empty or complete inventory.

The 2 MiB limit covers the combined assessment and report response. Overflow removes both detailed source assessment and report inventory/findings, preserves exact scanned counts and explicit blockers, and rejects if the bounded summary still does not fit. No truncation attests completeness.

## Dispatch evidence

`queueDispatchRules` supplies the booking earliest-call predicate and priority CASE/carry-over-count/creation-time ordering to both the real ticket repository and assessment SQL. Runtime claims use `clock_timestamp()` at mutation; assessment applies that same predicate at `transaction_timestamp()`. Eligibility is evidence at that exact observation, not a promise about later claims.

- `sqlCandidateAtObservation` means waiting, matching the observed dispatch date, and not scheduled before its earliest-call time. It is independent of business authorization, queue closure and counter availability.
- Legacy/shadow dispatch date derives from the location timezone calendar. Any latest stored open Queue Day is recorded separately and is not represented as authoritative. Enforced mode uses the latest open Queue Day and its database-time deadline.
- Business activity, queue openness, counter activity and cross-date called vacancy are distinct observed gates. Actor authorization is `not_assessed`; lock-time selection is `not_attested`. Intake pause does not reject calls to already admitted customers in the actual runtime.
- PostgreSQL `DENSE_RANK` describes relative candidate groups using the shared sort policy, and tie counts preserve native timestamp microseconds/null ordering. No ID tie-breaker or global cross-date order is invented. `authoritativeOrderKey`, global order and total order remain unproven.
- Pending carry-over is not active waiting work. Called state and arrival never establish occupancy. Timing-open and actual unreleased allocations are reported independently, including prior-day and terminal work still holding allocations. Expected end does not release occupancy.
- `recoveryDeadlineOpenAtObservation` describes the skipped deadline only; full recovery requires additional runtime gates and is not attested.

Cross-date unresolved calls occupy only their own counter. Missing/inactive counter configuration remains visible with null/false activity instead of dropping called work. Original/current Queue Day references and active segment evidence remain distinct. Missing, multiple, mismatched or inferred active segments are explicit lineage gaps.

## Plan and writer provenance inventory

Captured source, booking linkage, execution mode, sanitized frozen items, duration, pool units/revisions and session linkage remain visible. One service/pool per unit, 1–100 units and 5–480 minutes are the supported v1 shape. Bundles/multi-pool plans, unknown modes/sources/resources, missing plans and stale current mappings receive reasons; none is silently replaced from the current catalog or dropped to assert completeness.

| Evidence | Present source | Missing writer guarantee |
| --- | --- | --- |
| Ledger observation | `resource_ledger_scopes.revision`, `writer_coverage_complete` | Complete admission/session/configuration/lifecycle writer coverage and reconciliation. |
| Individual resource versions | `location_resource_pools.revision`, `service_resource_requirements.revision`; `resourceConfigurationService` updates scoped ledger revisions | A complete monotonic configuration watermark covering creation, edits, deletion, mapping and tracking writers. Individual revisions/fingerprints do not substitute. |
| Captured plan | `ticket_service_plans.source`, `booking_id`, `execution_mode`, `items`, `created_at`; `ticketServicePlanService` captures frozen demand | A writer-owned plan revision covering creation, replacement and cancellation. Timestamp/content fingerprint remains evidence only. |
| Queue lifecycle | `queue_days.version`, `deadline_version`, ticket original/current day links and active `queue_ticket_segments` | Complete transition/reconciliation coverage, unambiguous active lineage and segment watermark guarantees. |

Configuration and plan watermarks therefore remain null; inventory and requested forecast horizon completeness remain false. Even a supported shape cannot establish readiness.

## Verification

Pure and dedicated loopback PostgreSQL tests compare assessment with actual ticket/counter dispatch: future bookings, exact observation/+1 microsecond boundary, carry-over count priority, equal tuples, sub-millisecond differences, native `SKIP LOCKED` alternative selection, activity/closure/counter gates, overnight held work, pending carry-over and skipped deadline evidence. They also exercise coherent concurrent revisions, unknown/bundled/stale plans, ambiguous/inferred segments, authorization revocation on complete/limited/failed reads, real statement timeout, failed checkpoint sanitization, combined byte bounds, scope controls and read-only enforcement. Existing report and accepted producer compatibility are tested separately.
