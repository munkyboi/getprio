# Read-only request progress v1

This display contract uses existing published v2/v3/v4 projections. It adds no lifecycle command, reservation, allocation, completion policy or release behavior.

## Authoritative interval

Every allocation member exposes `startedAt`, `expectedEndAt`, `releasedAt` and `outcome`. The duration for that attempt is `expectedEndAt - startedAt`; use its frozen allocation interval rather than current catalog settings. `plan.observedAt` is read from database `clock_timestamp()`.

V2 members join through allocation-group `stageAttemptId` and member `lineId` to the relevant frozen line. V3/v4 execution objects identify `childAttemptId`, `allocationGroupId` and `allocationMemberIds`; join the exact child to its allocation member. Do not join solely by service/member ID across retries. Execution `startedAt`/`endedAt` and state corroborate actual lifecycle; inconsistent timestamps or multiple conflicting interval matches require unavailable timing rather than a guess.

Named extras deliberately have `extra.execution === null`. Their independent leaves are `extra.memberExecutions[].execution`, joined to allocation members by exact child-attempt identity. Their configured aggregate quantity is not a single execution clock. Historical attempts retain their own interval; the current row uses only the current attempt.

## Progress and overdue

Label the bar **planned time elapsed**, not work completed. For a valid started interval with positive planned duration:

- `elapsed = max(0, (releasedAt ?? estimatedServerNow) - startedAt)`.
- `progress = clamp(elapsed / (expectedEndAt - startedAt), 0, 1)`.
- `overdue = releasedAt == null && estimatedServerNow > expectedEndAt` for an unfinished started execution.

Actual release freezes the elapsed display. An early completion may have less than 100% of planned elapsed time; show the Completed outcome separately. Interrupted work freezes at its actual end and remains Interrupted. Reaching 100% never completes a child, frees capacity, advances a stage, or enables an action.

Draft, Pending, Waiting, Called, and protected reservations do not have service elapsed time. Queue waiting age and protection expiry are separate concepts. Missing, malformed, reversed or ambiguous allocation timestamps show timing unavailable; do not substitute zero or the latest catalog duration.

## Pause, retry and aggregation

The existing pause/resume command changes stage state/revision only. It retains occupancy and does not record an accumulated paused duration or extend `expectedEndAt`. Show Paused alongside wall-clock **elapsed since start**, which includes paused time and can become overdue. Do not freeze or subtract pause time or recalculate the expected finish without a separate authoritative policy change. A nested child's state may remain `in_service` while its corresponding stage attempt is paused.

Selective Retry creates a new child attempt and a new allocation interval after explicit release of interrupted work. Previous interrupted attempts remain frozen history. Completed extra attempts carried forward as dependencies retain their original completion clocks; they must not appear to restart with the retried parent.

A service/request rollup reports explicit counts of current leaves (pending, waiting, protected, skipped, started, completed and interrupted, with overdue as an overlapping flag), with stage/status context. Count exact current execution leaves once, including each named extra member; aggregate extra containers and historical superseded attempts do not add duplicate leaves. Parallel durations are not summed into wall-clock service duration or averaged into an invented overall percentage. Parent first-start spans workflow history and is not a substitute for leaf elapsed time.

## Freshness

Estimate server time from a successful response's `observedAt` plus monotonic elapsed time since receipt. The network journey makes this an estimate, not a new server decision. Refresh from existing polling/SSE invalidation and reset the anchor on a successful response. Expose last successful synchronization and read errors/stale state; do not silently treat a cached ticking bar as fresh authoritative state. Existing command revisions, permissions and pending ownership remain unchanged.

## Source evidence

`queuePlanProjection` exposes flat allocation intervals. `queueSelectionProjection` exposes nested allocation intervals, child histories, per-member extra executions and database observation time. `queueStageService` implements pause/resume as a stage-state update. `queueSelectionLedger.retryResource` preserves completed extras and creates replacement attempts only for explicit interrupted work. This audit found no additional DTO needed for display implementation. No fixture or user command was executed during the audit; browser acceptance belongs to the Vendor implementation.

API semantic review cleared this contract: no server-timing mismatch and no additional DTO needed. Browser acceptance remains a Vendor gate.
