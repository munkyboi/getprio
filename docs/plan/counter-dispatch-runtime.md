# Counter dispatch runtime contract

This slice supports the vendor dashboard and secure queue board change coordinated on 12 October 2026. Counters pull from the existing shared branch queue. Each counter may have one called ticket. New dispatch requires an active counter; legacy unassigned calls can be resolved through an explicit null lane.

The existing authorized branch/resource transaction remains the serialization boundary. Under that lock, Call next validates the active counter, checks its called vacancy and claims a ready waiting ticket using the existing priority and scheduled-booking predicate. Call next performs no resource allocation. Explicit service start/completion/interruption continue to operate on a locked ticket ID and retain their allocation/release and retry rules.

## Snapshot additions

- `calledTickets`: all called tickets in branch/date scope, ordered by call time. Same presentation fields as `current`, plus nullable `serviceCounterId`.
- `readyWaitingCount`: waiting tickets callable now, using the same PostgreSQL clock and booking predicate as the claim.
- `counterDispatch`: `{serviceCounterId, counterSlug, counterName, currentTicketId, canCallNext, blockReason}` per configured counter, plus explicit null/unassigned lane. Inactive lanes remain present so their existing calls can be resolved.
- Reasons: `QUEUE_DAY_CLOSED`, `COUNTER_OCCUPIED`, `COUNTER_INACTIVE`, `NO_READY_WAITING_TICKET`, or null. Closure includes enforced unopened/overdue Queue Days. Intake pause does not block serving already accepted tickets.

`current` stays an oldest-called compatibility summary; it must never select vendor actions. Advice is a read-time hint. Mutations recheck state in their transaction. Customer focus continues to use the lookup ticket's own identity, Queue Day and history; baseline wait estimates remain unchanged.

## Vendor requests

Call next requires `{counterSlug}`. Serve/Skip/Confirm require `{ticketId, counterSlug}` plus the existing confirmation credential for Confirm. Legacy unassigned tickets use explicit `counterSlug: null`. Missing target fails with 400; stale or wrong-lane targets fail with 409. A configured inactive counter may resolve an existing call, but cannot call another ticket. These requirements intentionally reject older clients sending an implicit branch-current mutation.

No new Repeat mutation exists; a client announcement must use the selected counter's explicit ticket. Existing ticket-ID service endpoints are unaffected by changes to other counters' called tickets.

## Verification

Disposable loopback PostgreSQL tests exercise actual vendor authorization and branch resource locks: same-counter contention, distinct counters, last waiting ticket, scheduled readiness, stale/wrong/unassigned/inactive targeting, confirmation/resolution isolation and revoked access. Snapshot tests cover multiple called counters while retaining a focused customer's own Queue Day prediction inputs.
