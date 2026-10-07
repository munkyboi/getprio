# Offline wait-time candidate

## Scope

This slice supplies a predictor interface with baseline fallback and a local export/train/evaluate pipeline. It does not load a model in the running API, persist shadow predictions, call an inference provider, allocate resources, or change customer estimates. `waitTimePredictor.js` remains the only live predictor. Model rollout remains on hold.

The first candidate, `queue-pace-median-v1`, is a transparent statistical calibration: for each scope, learn the median of historical actual wait divided by queue position, then multiply that pace by a new ticket's position. It is a candidate for comparison, not a resource scheduler, measured service duration, trained neural model, or proven improvement. It forecasts observation-to-call time, not actual service start.

## Dataset export

The existing read-only audit accepts `--dataset-output`, `--from` and `--to` together. Choose one scope. Vendor exports require `--vendor-slug`; Developer API sandbox exports use `--scope developer-sandbox`. Mixing these datasets is unsupported. Timestamps need an explicit timezone, and the lower bound is inclusive while the upper bound is exclusive. The upper bound must be at/before the database transaction timestamp, recorded as `capturedAt`; an unfinished future window is rejected.

The exporter selects the first feature-valid, usable called observation per ticket and scope for `baseline-v1` from the source history. Malformed earlier features do not hide a later valid observation. The chosen observation and its call must fall in the requested window. Later observations of an older ticket do not create another independent example. `excludedFeatureRows` counts otherwise usable called observations inside the requested window with missing/invalid whitelisted features, before ticket deduplication; it is not a count of excluded tickets. Pending/censored tickets are excluded; this does not remove survivorship bias.

Selection starts with observations inside the requested window and rejects each candidate if an earlier feature-valid observation exists for that ticket and scope, including observations before the window. Timestamp ties use sample ID. This avoids sorting and deduplicating the full history. An additive migration supplies partial indexes for window scans and per-ticket historical probes in both sources. Migration index creation uses the existing transactional deployment mechanism and can briefly block writes while indexes are built; schedule deployment accordingly. Query plans and timing on representative data remain a runtime acceptance gate.

Files include position, vendor average, priority band, pause state, timestamps, actual wait, source, and scope IDs. No names, contact details, booking references, raw ticket IDs or service-context payloads are exported. A random, unrecorded salt hashes ticket IDs, preserving within-export duplicate detection without cross-export correlation. Scope IDs are operational identifiers; treat files as private. Do not combine different exports: salts differ, so repeated tickets cannot be reliably deduplicated across them.

Dataset and experiment files use mode `0600` and exclusive creation; existing files are never overwritten. Parent directory permissions must also be appropriate. Keep them outside the public web roots and Git. No files are uploaded. Exports run under the audit's existing target assertions, repeatable-read read-only transaction and 30-second statement timeout. The 100,000-ticket export limit fails rather than silently truncating; offline input is limited to 64 MiB.

Manual vendor test tickets cannot automatically be separated from real traffic. Export provenance is explicitly unverified. Dataset scope labels and CLI `API_ENVIRONMENT` do not prove vendor database isolation.

The [offline curation command](wait-time-dataset-curation.md) can exclude operator-declared test or data-quality windows from a preserved original export. It records declarations and counts without upgrading provenance. Experiments record `datasetSha256` for the exact input bytes; this is input lineage, not verification that the observations represent genuine operations.

## Training and evaluation

Specify a fixed training cutoff and holdout end before comparing models. Historical observations and their outcomes must both precede the training cutoff. Earlier observations with outcomes after cutoff are excluded. Holdout observations must be at/after cutoff and before holdout end, with outcomes also before holdout end. Neither holdout features nor outcomes fit the candidate.

The offline reader rejects duplicate ticket keys, unsupported contracts, invalid features/timestamps, nonfinite or negative labels, and wait labels inconsistent with the timestamp difference (allowing 0.02 minutes for stored rounding). An empty eligible holdout produces null metrics, not an accuracy claim. The comparison recomputes unchanged `baseline-v1` from captured position and average; it does not use current catalog settings or assume every stored prediction equals that recomputation.

Fit separate rates per vendor/location or sandbox project/queue. Only positive-position, normal-priority, unpaused examples train the candidate. Deleted/unknown vendor locations do not train it. It never pools vendors or applies one scope's rate to another. The default minimum of 30 eligible historical tickets is an experimental fallback setting, **not** sufficient coverage or production approval. Changing it is explicit via `--minimum-training-tickets` and recorded in the artifact.

The predictor interface falls back to baseline for missing/incompatible models, invalid parameters, insufficient scope history, observations before the model cutoff, nonpositive positions, paused queues and non-normal priority bands. Booking-priority/recovery/carry-over contexts remain baseline-only. Serving the same artifact to public traffic or remote inference would require a separately reviewed integration, including artifact source/isolation binding, timeout handling, input contracts, and rollout controls.

Report baseline, candidate-with-fallback, and candidate-only errors separately, alongside fallback reasons and trained scopes. A zero-trained-scope result is expected with sparse data; identical baseline/candidate scores do not mean a trained model was evaluated. The artifact always states `rolloutApproved: false` and `customerEstimateChanged: false`.

### Training coverage

The console output and saved experiment include `trainingCoverage` (`wait-time-training-coverage-v1`). This reports each dataset scope, including scopes with only holdout observations. It shares selection logic with the fitter and counts only eligible historical labels strictly before the fixed cutoff. Holdout observations never count toward the training threshold or eligible observation days.

For each scope, the report shows completed historical tickets, overlapping tickets whose calls were not available at cutoff, eligible training tickets, excluded historical tickets, additional eligible tickets needed to reach the configured threshold, and eligible observation days/timestamps in UTC. Exclusion reasons are mutually exclusive, in this order: unknown location, unsupported priority band, paused queue, nonpositive position, invalid queue pace. Their counts sum to excluded historical tickets; overlapping tickets are reported separately. These exclusions describe candidate applicability, not invalid tickets or reasons to remove operational queue data.

`trainingSampleThresholdMet` answers only whether fitting can produce a rate under the configured sample-count rule. It is not readiness for live estimates. Coverage cannot identify manual test tickets, verify representative operations, assess uncertainty, or establish accuracy. Collect representative history across operating days and freeze a new future evaluation window; the reported gap must not be closed by moving holdout tickets into training and reusing the same evaluation score as independent evidence.

After deployment, rerun the offline command against the existing private dataset with a new output filename, such as `/root/wait-time-experiment-coverage.json`. No new database export is required to inspect this fixed dataset's coverage. The original experiment remains intact.

## Commands

After deployment, run on the droplet or an authorized private environment. The dates below illustrate the already-collected diagnostic window, not a representative production training set. With the current small dataset, the default threshold can produce no trained scopes.

```sh
cd /var/www/getprio
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/wait-time-prediction-audit.mjs \
  --scope vendors --vendor-slug pickle-bois-burgadols \
  --from 2026-09-30T00:00:00Z --to 2026-10-06T10:00:00Z \
  --dataset-output /root/wait-time-dataset.json

node scripts/wait-time-model.mjs \
  --dataset /root/wait-time-dataset.json \
  --cutoff 2026-10-06T06:52:10.199Z \
  --holdout-end 2026-10-06T10:00:00Z \
  --output /root/wait-time-experiment.json
```

Offline training/evaluation needs no database credentials or network connection. Future experiments should preselect a fixed window and keep that evaluation set unchanged; do not repeatedly tune on the same holdout and call the score independent validation.

## Verification and remaining work

Syntax, lint and type checking are authoring checks. Database export and offline execution remain runtime acceptance gates; no database connection, export, model fitting or local tests are run while authoring this slice.

Representative real operations, provenance review, additional scopes/days, confidence interval calibration, richer predictors, shadow capture, and controlled model promotion are still pending. Resource-aware predictions also need complete plans and actual transactional occupancy/reservations. This pipeline does not satisfy those dependencies or authorize inference publication.

The [private shadow inference foundation](wait-time-shadow-inference.md) adds artifact validation, a disabled-by-default backend adapter, and a local diagnostic CLI. It does not connect this experiment to live API estimates or capture.
