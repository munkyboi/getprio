# Offline resource refresh evaluation v2

This executable offline slice extends the AI Wait-Time Prediction PRD's evaluation area. It preserves the [v1 initial-only evaluator](resource-shadow-evaluation.md) and introduces a distinct v2 format. It does not connect a producer, database capture/export, customer delivery or model promotion. Compatible operational exports do not exist yet. Synthetic fixtures test arithmetic and contracts; they cannot establish production performance, privacy approval or rollout readiness.

## Inputs and provenance

The root has exactly `datasetVersion`, `provenance`, `from`, `to`, `outcomesAsOf`, `budgets` and `attempts`. Version is `resource-shadow-refresh-dataset-v2`; provenance is exactly `synthetic` or `unverified-operational-data`. Never mix the two. Observation requests use `[from,to)` and all known observation/forecast/acceptance/delivery/outcome timestamps must fit the frozen `outcomesAsOf`, which must be at or after `to`. Dates are valid UTC calendar strings with optional three-digit milliseconds.

`budgets` has exactly:

- `maximumAdmittedPerWork`: integer 1–10,000.
- `maximumAdmittedPerWindow`: integer 1–10,000 across the supplied dataset/window, not an inferred per-scope runtime limit.
- `maximumDeliveryAgeMs`: integer 1–28,800,000 for snapshot-to-delivery diagnostics.

These are declarations to freeze before evaluation. The evaluator does not prove when budgets were chosen or enforce runtime sampling. It reports admitted-count overruns without discarding inconvenient observations. At most 10,000 attempt records and 1,000 scope/pool/channel/kind groups are accepted; oversized inputs fail rather than truncate.

## Attempt record

Each record has exactly the fields below. Unknown metadata must remain null, never invented from a timestamp or row count.

| Fields | Contract |
| --- | --- |
| observationKey, workKey, scopeKey, poolKey | 64 lowercase hex pseudonymous keys. Observation keys are unique; work joins within scope. |
| channel, predictorVersion | Vendor source channel `vendor`, `qr` or `online`; predictor `resource-service-start-shadow-v1`. |
| attemptSequence, kind | Positive safe integer up to 1,000,000,000. Sequence 1 is `initial`; later sequences are `refresh`. Never select kinds by accuracy. |
| disposition, reason | `accepted` with null reason; `fallback` with a known inference/projection reason; `dropped` with `work_budget`, `window_budget`, `throttled` or `capture_unavailable`. |
| attemptedAt, observedAt | Request time inside export bounds; admitted observation time at or after request, or null for dropped requests. |
| forecastedAt, acceptedAt, predictedServiceStartAt | Accepted results require observation ≤ forecast ≤ acceptance ≤ cutoff and forecast ≤ prediction ≤ forecast + 480 minutes. Fallbacks can retain an unaccepted forecast for diagnosis but acceptance remains null. Drops have none. |
| queueRevision | Canonical nonnegative signed-BIGINT decimal string or null. This is declared revision context, not verified source coherence or configuration/plan provenance. Drops have null. |
| snapshotObservedAt | Declared snapshot observation time or null. Known time cannot exceed forecast time when present. Drops have null. |
| delivery | Exactly `state` and `at`. Accepted results use `private`, `not_delivered`, `unknown` with null time, or `delivered` with acceptance ≤ delivery ≤ cutoff. Fallback/drop results must be `not_delivered` with null time. This refers to the forecast, not unrelated baseline messages. |
| outcome | Exactly `state` and `at`: explicit `started`/`censored` at or before cutoff, or `pending` with null time. Never infer starts from calls, schedules or expected ends. |

Sequences are unique per scope/work and request times cannot move backwards as sequence increases. Pool, channel and frozen outcome must agree across that work's records. UTC timestamps differing only by explicit `.000` represent the same outcome. The evaluator sorts its own per-work arrays without mutating input order.

An export window may contain only refreshes. Such work is counted as `workWithoutInitialInWindow`; its first refresh is never relabeled as an initial estimate. Gaps between recorded sequences inside the window are counted explicitly. Missing leading history is not guessed. These diagnostics do not prove that all requested, failed, throttled or suppressed attempts were recorded.

## Metrics and interpretation

Initial and refresh groups are separate. Every attempt remains in its disposition and outcome counts; support is accepted attempts divided by all attempts, including drops/fallbacks. Unknown revision counts apply to admitted attempts; dropped requests do not invent snapshot metadata. Repeated refreshes are attempts, not independent work or a holdout sample.

Accuracy is actual service start minus predicted start in minutes; positive means the forecast was early. MAE, signed error and within-five-minute percentage are reported independently for:

1. Accepted forecasts whose authoritative declared start is at or after acceptance.
2. Delivered forecasts whose start is at or after delivery.
3. Those delivered forecasts with known snapshot-to-delivery age within the declared maximum.

Unaccepted forecasts, pending/censored labels, starts before acceptance and delivery after service start never enter their corresponding timely accuracy denominator. They retain explicit diagnostic counts. Refreshes after a declared start remain visible rather than being converted into a zero wait or silently removed. No fallback baseline is fabricated.

Snapshot-to-delivery and acceptance-to-delivery age summaries report samples, rounded mean, maximum and nearest-rank p95 in milliseconds. Unknown snapshot ages are counted, not treated as fresh. Stale deliveries remain visible in overall delivered diagnostics but are excluded from known-age timely delivery scoring. A declared `delivered` state is not proof that a customer saw a result.

All reports retain false `customerEstimateChanged`, `rolloutApproved`, `productionPerformanceEstablished`, `uncertaintyCalibrated`, `captureCoverageVerified`, `deliveryVerified` and `privacyApprovalEstablished`. Revision strings, keys, labels, budgets and timestamps are unverified declarations. No confidence interval, model training, temporal holdout or operational acceptance is supplied.

## Private command

```sh
node scripts/resource-shadow-refresh-evaluate.mjs \
  --dataset /root/resource-refresh-declared.json \
  --output /root/resource-refresh-evaluation.json
```

Only v2 files are accepted; old time-to-call and v1 initial datasets are not silently converted. Input is a bounded regular 8 MiB file with fatal UTF-8 decoding. New output is mode 0600 and never overwrites an existing path. Reports include SHA256 of exact input bytes. Console output contains paths/counts/false promotion flags, not grouped pseudonymous keys. This is private file processing, not a database exporter.

Upstream operational capture still requires the PRD's approved privacy assessment, legal-basis decision, retention/access/export audit/deletion/key-rotation controls and implemented notice evidence. Use keyed pseudonyms and stable joining namespaces; do not supply raw IDs, booking references, contact details or plain hashes of low-entropy identifiers. Shape validation cannot prove anonymization or legal approval. Complete authoritative source snapshots, work/session linkage and capture budgets retain independent gates.
