# Offline synthetic queue histories

The simulator writes a private file. It has no database imports, API calls, vendor IDs, customer identities or environment credentials. It does not issue application tickets, allocate live resources, or change estimates. It is a discrete-event reference simulator, not the implementation of GetPrio's live queue workflow.

## First-version scenarios

| Scenario | Capacity | Behavior |
| --- | --- | --- |
| `sequential` | One unit of pool 0 | Single resource, variable arrivals and service durations |
| `parallel` | Three units of pool 0 | Concurrent services with variable arrival intervals |
| `competing` | Three units of pool 0, two of pool 1 | Services require both pools atomically; some require two units of pool 0 |
| `disrupted` | Two units of each pool | Competing resources, bookings arriving 20 minutes early, cancellation/no-show deadlines, dispatch pauses, service interruptions |

All resources are generic fungible units. A ticket's requirements are simultaneous; its duration is not multiplied by units. FIFO applies among eligible waiting tickets. An eligible head that cannot acquire its resources blocks later eligible tickets. Bookings that are not ready do not block ready tickets. These are simulator assumptions, not a declaration of live queue policy.

Printed, mobile and vendor-issued channels rotate independently of service eligibility. This simulator does not model QR claiming, authentication or mobile notification delivery. Booking readiness is a simple relative offset; it does not model future reservation protection or admission contracts. Carry-over, priority recovery, overbooking, business hours, dynamic staff capacity and independently identified resources are future scenarios.

Calls coincide with service starts in this first version. Both events are written separately, so a later simulator version can introduce call-to-start delays. Service interruptions add ten minutes, retain resources and emit interruption/resumption events. Dispatch pauses do not interrupt active work. Deadlines censor only waiting tickets; a ticket already started is not cancelled by that deadline. No-shows here represent removal of a waiting ticket, not real customer absence detection.

## Dataset and safeguards

Generated files use `wait-time-synthetic-dataset-v1`, source `synthetic`, provenance `synthetic-simulation`, and scopes such as `synthetic:parallel`. They never use operational vendor/location IDs. The simulator records version, seed, ticket count, assumptions, scenario settings, censor counts and timestamped events (minute offsets from `from`). Completed called observations become training samples; censored tickets remain in scenario events/counts without fabricated call labels.

Each sample captures only arrival-time position, configured average service duration, priority band and dispatch-pause state. Future service lengths, cancellations and occupancy outcomes do not enter these training features. Position is the number of waiting tickets already present plus one; it does not count active services. Simultaneous departures/cancellations precede arrivals, and dispatch follows the arrival batch. Actual simulated wait is arrival to call. It is computed from resource scheduling, not copied from a baseline prediction or candidate model.

The same simulator version, seed, start and count produce the same bytes. `capturedAt` is the virtual window end, explicitly not a wall-clock operational capture time. Default seed is 42 and count is 120 per scenario. Seeds are unsigned 32-bit integers; each scenario uses base seed plus its index modulo 2^32. Counts are bounded to 1–2,000 per scenario. Files are bounded to 64 MiB, created exclusively with mode `0600`, and never overwritten. Keep outputs outside Git and public web roots.

Operational readers and curation reject synthetic contracts. Offline training requires explicit `--dataset-kind synthetic` and creates `wait-time-synthetic-experiment-v1`. The production shadow adapter already rejects its artifact version, source and scope types. No production reader is modified to accept synthetic artifacts. The experiment always states rollout is unapproved and production performance is unestablished.

## Commands

Run in an authorized private environment after deployment:

```sh
cd /var/www/getprio
node scripts/wait-time-simulate.mjs \
  --seed 42 --tickets-per-scenario 120 \
  --start 2026-01-01T00:00:00Z \
  --output /root/wait-time-synthetic-seed42.json
```

Freeze the cutoff and holdout end before evaluating. Choose bounds inside the generated window. Do not merge operational data or independently generated exports into this dataset. For example, after inspecting the reported `to`, select a cutoff with historical and future called tickets for the intended scopes, then run:

```sh
node scripts/wait-time-model.mjs \
  --dataset-kind synthetic \
  --dataset /root/wait-time-synthetic-seed42.json \
  --cutoff '<fixed timestamp within the reported window>' \
  --holdout-end '<reported to timestamp>' \
  --output /root/wait-time-synthetic-experiment-seed42.json
```

The existing experimental candidate learns median minutes per position; it is not a resource-aware learned model. Multiple-resource and disruption scenarios can expose its limitations. Zero-wait tickets train a zero pace if eligible; booking-priority and paused contexts fall back. Scopes with too little eligible history also fall back. Empty holdouts have null metrics; neither fallback-only results nor synthetic accuracy establish vendor performance.

## Acceptance and next work

Authoring checks are syntax, lint and diff validation only. No local simulation or model fitting is executed during this implementation. Operator execution remains the runtime gate. The [resource comparison runner](synthetic-resource-comparison.md) adds a deterministic reference and fixed repeated-seed temporal comparisons. Changed-assumption evaluation, richer resource features, scenario configuration and full application testing in an isolated test database remain future work. Real vendor calibration remains a separate gate before publishing learned estimates.
