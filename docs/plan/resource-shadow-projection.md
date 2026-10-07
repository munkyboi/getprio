# Reservation-aware resource service-start shadow projection

## Delivered scope

`backend/src/services/resourceShadowProjection.js` adds a pure internal forecast function, `predictResourceServiceStartShadow({ snapshotBytes, validation, targetWorkRef })`. It consumes the accepted `resource-operational-snapshot-v1` byte validator and the caller's trusted scope/clock/horizon configuration. It does not read a database, load a model, call a provider, change a queue, allocate/release resources, capture a result or publish an estimate. No live caller is added.

Version: `resource-service-start-shadow-v1`. Target: `time_to_actual_service_start`. This is a deterministic private forecast, not trained AI. Existing `baseline-v1` predicts time to call and is not an interchangeable score/label. A future integration keeps public baseline behavior and separately records unavailable resource diagnostics; this module does not relabel a baseline time-to-call value as service-start wait.

Current main has the internal ledger and domain transaction foundations from PRs #317/#318. Booking/service writers remain unintegrated, tracking/writer coverage remain disabled and no authoritative snapshot producer exists as verified at `032477cf`. The owning runtime workstream must implement that producer and the covered booking/session writers. Do not create a ready snapshot from audit output, timing records or synthetic data.

## Supported inputs and ordering

The initial contract supports ordinary resource-only location queues, one service item/pool per work unit, integer duration 5–480 minutes. The selected target must be Waiting. The validator checks exact scope/source binding/version/freshness, coherent bounded inventory, links and protected-reservation conversion rules before simulation.

Projection uses only the target pool's complete competing work, reservations and allocations. Other pools do not consume its capacity. Producer-generated equal-width `orderKey` values are compared ordinally; applicable priority/admission/tie-break meaning belongs to the producer. No priority is invented or recomputed here. Unknown or unsupported plans cannot be smuggled in as zero demand because the entire snapshot is validated first.

Eligible work can start no earlier than the trusted consumption time, `earliestCallAt`, and its protected reservation's start where applicable. Work not yet ready does not block ready work, but its reservation still protects capacity. The first eligible ordered work item blocks later eligible same-pool work if it cannot fit; no shorter-job bypass is added. Every booking/readiness/reservation boundary is visited so newly eligible protected work participates in the producer's order.

Called work in the target pool makes projection unavailable: v1 has no observed confirmation/presence-to-start delay or guaranteed immediate start. In service work is represented by its allocation and is never enqueued or allocated twice. Intake pause is not treated as a service-dispatch pause; it stops new intake rather than silently stopping known service progress.

## Forecast versus actual release

Every target-pool allocation must have an active resolved state and a known expected completion later than the trusted consumption time. Unknown/unresolved completion or overdue occupancy produces unavailable output. No one-minute overrun heuristic is used. Ledger allocation remains unreleased; expected end is used only in a private forecast interval.

The joint profile of projected active occupancy and protected reservations must fit capacity throughout the requested horizon. A forecast conflict anywhere in that target-pool horizon causes an explicit unavailable result, even if an earlier isolated start might fit. This conservative policy avoids projecting through a known inconsistency.

A proposed work interval must fit capacity for its entire duration and finish within the requested forecast horizon, whose reservations must be complete. Booking work must also finish within its own binding; expired/insufficient intervals need runtime reconciliation rather than an assumed extension. On a hypothetical booking start, its protected binding is removed from the private profile and replaced by its projected occupancy once, avoiding double counting. Other protected bookings remain in the profile whether or not their customers are in the current queue.

Successful output includes `predictedServiceStartAt`, `serviceStartWaitMinutes`, `forecastedAt` (trusted consumption clock), `snapshotObservedAt`, ledger/configuration revisions and horizon. Wait is measured from `forecastedAt`, not the earlier database observation. Expected completion assumptions and service-start target must remain visible in private evaluation. There are no future arrivals, actual future completion labels, automatically inferred service delays or numeric confidence intervals.

## Unavailable output and execution limits

Every result sets `customerEstimateChanged: false`, `rolloutApproved: false` and `uncertaintyCalibrated: false`. Fallback outputs have null predicted start/wait, so callers cannot interpret missing occupancy as zero wait. `runtime_not_ready` preserves the producer's allowlisted private reason codes. Invalid scope/contract/freshness/inventory diagnostics are sanitized to stable codes; unexpected exceptions become `resource_projection_error`.

Projection limits per target pool: 250 pending/called work entries, 500 protected reservations, 100 allocations, 4096 scheduling steps and 100,000 counted interval/event operations. Byte decoding and overall inventory bounds remain those of the accepted validator. Inputs exceeding the projection bounds fail closed rather than truncate. These finite operation limits bound the algorithm; they are not a measured wall-clock guarantee or a cancellation primitive. The future provider/hook needs its own deadline and freshness recheck before accepting a late result.

Reasons include `target_not_waiting`, `projection_inventory_limit`, `called_service_start_unknown`, `occupancy_completion_unknown`, `overdue_occupancy`, `forecast_capacity_conflict`, `reservation_window_unusable`, `no_start_within_horizon` and `projection_budget_exceeded`, plus validator diagnostics.

## Integration and verification gates

Runtime producer implementation and authoritative writer coverage are separate prerequisites. Once available, add a bounded private provider/capture hook, pair forecasts against actual service starts (not calls), and report support/fallback coverage by location/pool/channel. Multi-item/sequential work, stages and developer queues require explicit future contract extensions. No model or customer-estimate promotion follows from this module.

Authoring checks: Node syntax, focused ESLint and whitespace validation. No local tests, database use, scenario executions, provider integration or performance measurement were run. Hosted checks and separately authorized operational/concurrency/forecast verification remain acceptance gates before any live shadow hook.
