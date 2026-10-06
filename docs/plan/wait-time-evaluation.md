# Wait-time evaluation diagnostics

## This slice

The existing read-only prediction audit now includes an `evaluation` section for vendor samples and a separate `developerApiSandbox.evaluation` section. This is data preparation for a future forecasting layer. It does not fit a model, invoke DigitalOcean inference, change estimates, allocate resources, or approve rollout.

The prediction target is **minutes from the observation until the ticket is called**. Calling and actual service start remain different events. Service-timing records cannot silently replace these labels; a start-of-service forecast needs its own target and dataset contract.

## Counting and validity

Existing summary/coverage fields count prediction observations. Repeated reads can create several observations for a single ticket, so those fields are not independent training-example counts.

Evaluation reports raw observations, distinct called tickets, and usable distinct tickets separately. Each tenant/location/predictor-version or sandbox project/queue/predictor-version uses the earliest usable called observation for each ticket, ordered by captured time and sample ID. Predictions and labels must be finite, nonnegative, and have a call timestamp at or after the observation. Invalid called observations are counted and excluded. Pending and censored observations are counted separately and are not treated as zero wait.

No customer identities, ticket references, feature payloads, or individual samples are exported. Scope IDs are included for interpreting aggregate coverage. Vendors with deleted/unknown location IDs are shown as `unknown`; the report cannot reconstruct their original location. Sandbox is explicitly filtered in SQL. Vendor samples remain untagged by environment; audit configuration does not establish production isolation.

## Temporal evaluation

For each scope and predictor version:

1. Order distinct usable tickets by their first usable observation time.
2. When at least five tickets exist, select the observation time at the beginning of the latest approximately 20% as the holdout boundary. Five is only the minimum needed to attempt this split, not an adequate dataset size.
3. Keep timestamp ties together on the holdout side. The realized holdout fraction may exceed 20%; all observations at one timestamp can leave no historical partition.
4. Historical tickets must have both their observation and their call outcome strictly before the boundary. Earlier observations with later outcomes are excluded as overlapping; their label would not have been available at the training cutoff.
5. Report historical and holdout ticket counts and the stored baseline's mean absolute error. Holdout also reports signed error (`actual - predicted`) and percentage within five minutes. Null errors mean no evaluable tickets, not perfect accuracy.

`temporal_split_available` means both partitions are nonempty. It does **not** mean adequate sample size, representative operating days, sufficient coverage, or a trained model is ready. Observation days are UTC dates, not business dates. Per-scope splits are suitable for separate scope-level diagnostics; do not combine them into a shared cross-vendor model split, since their boundaries differ.

Manual test tickets and sandbox simulations remain diagnostic data. Their durations and behavior do not establish real production accuracy. This report does not automatically identify or remove simulated vendor tickets. Called-only metrics do not assess cancellation/no-show bias.

## Running

Use the existing audit on the deployed checkout, with the expected database target verified:

```sh
cd /var/www/getprio
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/wait-time-prediction-audit.mjs \
  --scope vendors --vendor-slug pickle-bois-burgadols
```

For Developer API sandbox diagnostics use `--scope developer-sandbox`. The vendor filter does not apply to sandbox results. Existing report sections and ticket-context flags remain compatible. Queries run inside the audit's repeatable-read, read-only transaction with its existing 30-second statement timeout; no migrations or writes are needed.

## Remaining gates

- Review actual report coverage and label validity after deployment. Syntax/lint and hosted CI are not database execution proof.
- Establish representative real operating data, ticket provenance, quality targets, and a fixed future evaluation window before training. Backtests must freeze the split rather than letting newly captured outcomes redefine it.
- Add the candidate model and comparison against the unchanged baseline, including sparse-data fallback and interval calibration. Separate pooling/generalization evaluation from these per-scope diagnostics.
- Resource-aware forecasts require complete ticket plans, transactional occupancy/reservations, and a defined target. A saved plan is not live occupancy.
- Shadow predictions and subsequent rollout remain separate, explicitly reviewed releases. The existing model rollout hold remains in effect.
