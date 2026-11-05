# Audit current queue availability and stale-ticket failure modes

Type: research
Status: resolved
Claimed by:
Blocked by: none

## Question

What does the current GetPrio implementation actually guarantee—and fail to guarantee—across store hours, Queue Day close/reopen/pause, current-day filtering, carry-over, skipped recovery, backend restarts, multiple app instances, notifications, and stale previous-day tickets?

## Evidence to investigate

- Queue services, repositories, snapshots, routes, permissions, frontend state summaries, and vendor controls.
- Store-hours evaluation, location timezones, overnight hours, absent hours, and schedule edits.
- Closure/pause schema, uniqueness constraints, event metadata, current migrations, and existing fixtures.
- Backend timers, deployment topology, restart behavior, and transaction/concurrency boundaries.
- Tests, smoke coverage, lifecycle PRDs, status trackers, and contradictions with `CONTEXT.md`.

## Required asset

Create `../assets/01-current-state-audit.md` with code-linked findings, invariant gaps, data risks, and the concrete questions that later tickets must resolve.

## Resolution must establish

1. The authoritative current-state diagram and state ownership boundaries.
2. Every path by which a ticket or Queue Day can become stale or invisible.
3. Which existing behaviors can be retained, which conflict with the destination, and which migrations need compatibility treatment.
4. The deployment/concurrency assumptions the reconciliation design must survive.

## Resolution

The repository audit is captured in
[`../assets/01-current-state-audit.md`](../assets/01-current-state-audit.md).

The decisive finding is that the current system has no explicit open Queue Day:
absence of a closure/pause is treated as open, while store-hours checks, mutation
dates, paid issuance, snapshots, and notification selection enforce different
boundaries. Previous-day active tickets can consequently become invisible without
an outcome. The asset establishes the current ownership diagram, enumerates the
stale paths and transaction/schema risks, separates reusable behavior from
destination conflicts, and routes the remaining decisions to tickets 02–07.

Focused queue lifecycle/helper/repository/payment tests passed: 26 passed, 0
failed. They verify current contracts but do not cover the newly documented
restart, concurrency, stale-day, or carry-expiration gaps.
