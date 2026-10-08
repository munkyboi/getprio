# Offline actual service-start evaluation

This slice evaluates declared paired observations for `resource-service-start-shadow-v1`. It has no database exporter/reader, capture hook, training or live inference caller. The existing time-to-call dataset and synthetic queue comparison use a different target and are rejected. Runtime writer coverage, ready inventory, authorized capture and explicit service-start outcomes remain prerequisites for operational data.

## Contract

A private JSON file has exactly these fields:

- `datasetVersion`: `resource-shadow-evaluation-dataset-v1`.
- `provenance`: `synthetic` or `unverified-operational-data`; never combine them in one export.
- `from`, `to`: closed observation export bounds, interpreted as `[from,to)`.
- `outcomesAsOf`: frozen outcome cutoff, at or after `to`.
- `observations`: at most 10,000 entries.

All timestamps are valid UTC calendar strings with optional three-digit milliseconds. Outcome resolution can occur after the observation window but no later than outcomesAsOf. Pending outcomes stay pending at that cutoff. The evaluator never queries later outcomes.

Each observation has exactly:

| Field | Meaning |
| --- | --- |
| observationKey | Unique 64-character lowercase hex pseudonymous observation key |
| workKey | Stable pseudonymous work identity across repeated attempts |
| scopeKey / poolKey | Stable pseudonymous location and resource-pool identities |
| channel | Stored vendor queue channel: vendor, qr or online |
| predictorVersion | resource-service-start-shadow-v1 only |
| observedAt | Time the private inference attempt was admitted |
| forecastedAt / acceptedAt | Successful wrapper timestamps; null for unavailable attempts |
| predictedServiceStartAt | Accepted forecast start; null for unavailable attempts |
| fallbackReason | null on success, otherwise a known private inference/projection reason |
| outcome | Exactly state and at; state started/censored with explicit timestamp, or pending with null timestamp |

For success, observedAt ≤ forecastedAt ≤ acceptedAt ≤ outcomesAsOf. Predicted start must be at or after forecastedAt and within the supported 480-minute maximum horizon. The export must contain only accepted wrapper results; the validator's shape checks do not prove inference provenance, original readiness, complete inventory, revisions or actual service outcome authenticity.

Future exporters must derive started outcomes from the explicit authoritative service-session start, not ticket call, confirmation, booking schedule or expected completion. Cancellation/no-show/termination without service start is censored. No call time is substituted. Use keyed pseudonyms with a stable namespace for joining, not raw IDs, booking references, names/contact data or plain hashes of low-entropy identities. The exact object shape rejects additional identity/context fields, but cannot independently prove anonymization. Vendor source only; developer/stage/multi-item contracts are not introduced here.

## Selection and scoring

Select the earliest attempt per scope/work for this predictor version. Timestamp ties use ordinal observationKey, never prediction quality. Retain an early fallback instead of selecting a later successful forecast. Reject duplicate observation keys and conflicting outcome declarations for the same work. This is descriptive earliest-attempt evaluation, not a train/holdout split or independent test set.

Group by scope/pool/channel (maximum 1000 groups), reporting selected work, successful forecasts, fallback reasons, started/censored/pending work, support percentage and scored starts. Only successful forecasts with an explicit service start at or after acceptance contribute to accuracy. Starts before acceptance are counted separately; fallback, pending and censored outcomes never become zero waits or fabricated baseline predictions.

Error is actual start minus predicted start, in minutes. Positive signed error means the estimate was early; negative means late. Accuracy includes MAE, mean signed error and percentage within five minutes. Support percentage covers all selected attempts, including pending/censored/late-outcome cases, and must be read alongside scoredStartedWork. Empty groups/data produce no accuracy claim. There is no inferred confidence range or model promotion.

## Command and privacy

Once a compatible private export exists:

```sh
node scripts/resource-shadow-evaluate.mjs \
  --dataset /root/resource-service-start-observations.json \
  --output /root/resource-service-start-evaluation.json
```

Do not use the old wait-time-dataset.json or time-to-call simulator output. There is no compatible operational export yet. Input is a regular bounded 8 MiB file and is decoded with fatal UTF-8 handling. The report includes the input SHA256 and private grouped diagnostics. A new output is created with mode 0600 and existing paths are never overwritten. Console output contains only output path, counts and false promotion flags, rather than grouped identities. It always reports customerEstimateChanged=false, rolloutApproved=false, productionPerformanceEstablished=false and uncertaintyCalibrated=false for both provenance kinds.

Authoring checks: Node syntax, focused ESLint and whitespace validation. No local tests, file evaluation, database access or live capture were run. Scenario/outcome verification remains required before operational integration or model decisions.
