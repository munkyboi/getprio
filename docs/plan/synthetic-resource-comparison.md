# Synthetic resource-aware comparison

This offline slice adds a deterministic resource reference and a fixed multi-seed comparison runner. It writes one private report, generates datasets in memory, and does not connect to a database or API. It does not publish predictions, change the live queue, promote a model, or establish vendor accuracy.

## Reference predictor

`synthetic-resource-reference-v1` takes a snapshot when each ticket is issued, before dispatch. Inputs are configured resource capacities, issued service requirements and configured durations, known booking-ready times, and active service progress observable at that moment. Requirements across pools are allocated atomically; units do not multiply duration. Projection follows the simulator's FIFO policy among eligible tickets, including head blocking on insufficient resources.

Active service progress subtracts interruption minutes already observed. Remaining service is configured duration minus observed working minutes. A still-active service past its configured duration gets an explicit one-minute residual assumption, not its actual finish time. This is a heuristic to keep projection finite; overruns need calibration.

An actively interrupted service or paused dispatch produces a reference fallback, because there is no known resumption time. Reference-with-fallback uses the existing baseline in those cases. Reference-only metrics exclude them and report their counts/reasons separately. Booking readiness remains supported by the reference even when the learned median-pace candidate falls back for booking priority.

The snapshot never includes actual sampled service durations, actual completion times, future customer arrivals, cancellation/no-show deadlines, future interruption/resumption events or future pause windows. Current interruption state and past paused time are derived only from events at/before the observation. Future arrivals that bypass an unready booking or future cancellations may change its actual wait, so reference error is expected. These known-information limits are preserved even though the simulator has access to future truth.

The reference is an independent projection implementation; it does not invoke the simulator's dispatcher to generate predictions. It shares documented scheduling assumptions with the simulator. Low error under those assumptions is not independent confirmation of real-world behavior.

## Versions and existing files

The original `wait-time-simulate.mjs` command retains `synthetic-queue-v1`, default output behavior and existing dataset bytes. Only the comparison runner opts into `synthetic-queue-reference-v1`. In that mode, each completed sample carries its arrival-time reference prediction, and ticket hashes include the reference simulator version. The shared reader accepts both explicit synthetic versions. Operational readers and production shadow inference still reject synthetic inputs/artifacts.

Metric calculation is shared with the existing offline trainer without changing its error definition: signed error is actual wait minus prediction. Positive values mean underestimation; negative values mean overestimation.

## Fixed experiment protocol

Default seeds are **42, 314 and 2718**, with 120 tickets per scenario, virtual start `2026-01-01T00:00:00Z`, training cutoff at minute 360 (06:00 UTC) and holdout end at minute 960 (16:00 UTC). Freeze these before comparing results. The original seed-42 experiment ending at 20:32 remains a distinct preserved experiment; its scores are not directly interchangeable with this shorter fixed comparison window.

Each seed trains its own median-pace model with the unchanged minimum of 30 eligible historical tickets. Calls must be strictly before cutoff to train. Earlier observations whose calls overlap cutoff are excluded. All full-method metrics use the same later called tickets with observation and call before the holdout end. Candidate-only and resource-only metrics have different subsets and must not be compared as if they covered all those tickets. Censored tickets never acquire call labels.

The report includes per-seed dataset hashes, trained scopes, training coverage, overlapping-ticket counts and all method scores/fallback reasons. Aggregate errors pool eligible tickets by scenario; seeds are not weighted equally. Inspect per-run results to identify deterioration hidden by pooled averages. Hashes use compact UTF-8 `JSON.stringify(dataset)`, generated in memory; no dataset files are written or merged.

This is repeated within-seed temporal evaluation, **not** training on one seed and evaluating that model on unseen seeds. The four scenarios each use base seed plus scenario index modulo 2^32; overlapping seed blocks are rejected. Different random streams still share simulator assumptions and do not establish statistical independence or changed-assumption generalization.

## Operator command

After deployment, run in a private environment:

```sh
cd /var/www/getprio
node scripts/wait-time-synthetic-compare.mjs \
  --seeds 42,314,2718 \
  --tickets-per-scenario 120 \
  --start 2026-01-01T00:00:00Z \
  --training-minutes 360 \
  --holdout-end-minutes 960 \
  --output /root/wait-time-resource-comparison.json
```

The runner accepts up to five non-overlapping seed blocks and 1–200 tickets per scenario, bounding repeated projection work. A selected fixed evaluation window must fit every generated dataset; incompatible windows fail instead of silently shrinking per seed. Sparse histories and empty scenario holdouts are reported without relaxing thresholds or inventing scores. Output is exclusively created with mode `0600` and a maximum 8 MiB report size. Existing files are never overwritten; parent directory permissions remain the operator's responsibility.

## Acceptance and remaining work

Authoring checks are syntax, focused lint and diff validation. The requested offline statistical comparison was also executed locally with the fixed default seeds/window; no local test suite or database was used. Deployment and execution in the operator's environment remain separate acceptance gates. No result sets rollout approval or production performance to true.

### First fixed comparison

Mean absolute error in minutes across seeds 42, 314 and 2718 (ticket-weighted):

| Scenario | Called holdout tickets | Baseline | Candidate with fallback | Resource reference with fallback |
| --- | ---: | ---: | ---: | ---: |
| Sequential | 169 | 6.40 | 26.50 | 4.75 |
| Parallel | 127 | 78.55 | 4.99 | 3.57 |
| Competing | 194 | 107.73 | 11.68 | 6.03 |
| Disrupted | 79 | 161.99 | 161.99 | 60.71 |

Each run trained three candidate scopes; disrupted service remained candidate-fallback-only. The resource reference fell back for 13 actively interrupted observations; its 66 supported disrupted observations still had MAE 41.26 minutes and 0% within five minutes. Positive mean signed error on that supported subset indicates underestimation. Thus resource knowledge helps under the chosen assumptions but does not resolve disruption uncertainty. Pooled winners are not uniform: the learned candidate narrowly outperformed the resource reference for seed 42 parallel service and seed 2718 competing service. Preserve these outcomes rather than choosing only favorable seeds or changing the frozen window to improve the score.

Changed scheduling assumptions, cross-seed model-transfer evaluation, richer learned features, uncertainty calibration and real vendor operations remain future work. Production resource-aware estimation separately requires complete service plans, reservations, authoritative occupancy snapshots, access controls, transactions, concurrent allocation safety and rollout controls. This offline reference does not satisfy those live dependencies.

The next integration boundary and read-only plan inventory are documented in [Resource shadow integration readiness](resource-shadow-readiness.md).

## Evaluation coverage report (v2)

`wait-time-synthetic-comparison-v2` retains the fixed experiment, dataset hashes, predictor behavior and metrics. Each per-run and aggregate scenario now includes `coverage`:

- `issuedTickets` and `censoredTickets` describe the full simulation, not the holdout. Censored tickets have no call labels and remain outside accuracy scoring.
- `selection.calledTickets` is partitioned exactly once into `historicalTickets` (observation and call before cutoff), `overlappingTickets` (observation before cutoff, call at/after cutoff), `observedAfterHoldout` (observation at/after end), `calledAfterHoldout` (holdout observation, call at/after end), and `scoredTickets` (observation at/after cutoff and both observation/call strictly before end). Historical counts are window membership, not eligible model-training counts; consult the separate training coverage.
- `candidate` and `resource` support contain `supportedTickets`, `scoredTickets` and `supportedPercent`. The denominator is scored called tickets only. These are not forecast availability for all issued tickets, censored work, or production traffic. A zero-ticket holdout has null support percentage and null accuracy, rather than an invented zero-percent result.
- Supported tickets plus the method fallback counts equal scored tickets. Aggregate counts sum the per-run counts; percentages use pooled tickets rather than averaging seed percentages.

The output version changed because the report now carries an explicit selection/coverage contract. Existing files remain untouched; use a new output filename, for example `/root/wait-time-resource-comparison-coverage.json`. No database records, model thresholds, source dataset, production hooks or rollout policy change. Automated CLI regressions verify count partitions, pooled aggregation, fixed default scores, sparse holdouts, private file permissions and exclusive output creation.

## Changed-assumption sensitivity profiles

The comparison CLI accepts `--scenario-profile baseline|dense-arrivals|variable-durations`. Default `baseline` preserves the original reference dataset bytes and hashes. The two opt-in profiles use `synthetic-queue-sensitivity-v1`, record the profile in dataset/report metadata, and bind scope and ticket identity to that profile so unlike experiments are not pooled as the same scope. They require explicit synthetic reader mode and are not accepted as operational datasets. The ordinary simulator CLI and its default dataset stay unchanged.

| Profile | Arrival process | Actual duration distribution | Known duration used by predictors |
| --- | --- | --- | --- |
| baseline | Existing scenario gap | 0.6–1.4 times configured duration, rounded | Existing configured duration |
| dense-arrivals | Scenario gap halved, rounded, minimum one minute | Baseline distribution | Existing configured duration |
| variable-durations | Baseline arrivals | 0.25–1.75 times configured duration, rounded | Existing configured duration |

Only the named assumptions change. Capacity, resource requirements, FIFO/eligibility rules, cancellations, interruptions and pause schedule retain existing semantics. The same random streams are reused for reproducible paired sensitivity comparisons; they are not independent experiments. Variable durations change simulated future outcomes, never the known plans passed to the reference predictor. Calls still coincide with actual starts in this simulator; these scores cannot validate separate real-world targets.

Run each profile to a separate private output, preserving the frozen seeds/window:

```sh
node scripts/wait-time-synthetic-compare.mjs \
  --scenario-profile dense-arrivals \
  --output /root/wait-time-dense-arrivals.json
node scripts/wait-time-synthetic-compare.mjs \
  --scenario-profile variable-durations \
  --output /root/wait-time-variable-durations.json
```

Default-window observations from seeds 42, 314, 2718, 120 tickets per scenario:

| Profile/scenario | Scored called tickets | Baseline MAE | Resource with fallback MAE |
| --- | ---: | ---: | ---: |
| Dense arrivals / sequential | 55 | 8.53 | 8.65 |
| Dense arrivals / parallel | 0 | unavailable | unavailable |
| Dense arrivals / competing | 46 | 450.72 | 11.37 |
| Dense arrivals / disrupted | 0 | unavailable | unavailable |
| Variable durations / sequential | 165 | 10.43 | 9.70 |
| Variable durations / parallel | 127 | 82.90 | 6.07 |
| Variable durations / competing | 194 | 112.94 | 10.78 |
| Variable durations / disrupted | 75 | 166.79 | 54.67 |

Denser arrivals can issue all work before the frozen training cutoff. Empty holdouts are retained with null metrics/support, not repaired by moving the window. Inspect selection and training coverage before interpreting differences, and do not compare supported-only metrics as equal-population estimates. Predeclare a different experiment if a different window or ticket count is needed; do not tune it after seeing the winner. Within each profile, training remains historical and seed-local; this is neither cross-profile nor cross-seed model-transfer validation.

Seven focused automated regressions cover exact baseline hashes, repeatability, changed assumptions, profile-bound provenance/scopes, rejection in operational mode, invalid profile output protection, known-plan isolation from future duration outcomes and the preceding coverage/boundary contracts. No database, live capture, confidence calibration, resource activation or customer rollout is introduced.

## Cross-seed model-transfer evaluation

An opt-in `--training-seed` selects `wait-time-synthetic-transfer-v1`. The command generates one declared training dataset, fits its historical outcomes strictly before the fixed cutoff once, and reuses that model for all evaluation seeds. Evaluation-seed history and outcomes never enter fitting. The original command without this option keeps within-seed fitting, v2 reporting and existing scores.

```sh
node scripts/wait-time-synthetic-compare.mjs \
  --training-seed 9001 \
  --seeds 42,314,2718 \
  --output /root/wait-time-cross-seed-9001.json
```

Declare the training seed, evaluation seeds, profile, ticket count and windows before inspecting scores. The training seed is not an evaluation seed. Its closed simulation window must cover the training cutoff, but does not need to extend through the evaluation holdout end; each evaluation dataset must cover the full scoring window. At most four evaluation seeds plus one training seed are allowed; every four-scenario seed block must be disjoint modulo 2^32, including wraparound. Equal or partially overlapping blocks fail before output creation. The same scenario profile is used for training and evaluation. This is transfer to different random streams under shared assumptions, not changed-profile transfer, independent vendor validation or production accuracy.

The report records `trainingMode`, separate `transferTraining` evidence (seed, full dataset hash/window, fitted model hash, trained scope count and training coverage), and each run's actual `trainingSeed` and `modelSha256`. All hashes use compact UTF-8 JSON without whitespace. Dataset hashes include the full simulation; model hashes describe only the fitted result, not a deployable artifact or rollout authorization. Every evaluation run in transfer mode uses the same model hash and the same training coverage. Per-run `excludedOverlappingTickets` and selection counts still describe evaluation tickets excluded by the temporal window, while training coverage separately describes the training seed's exclusions.

A model with insufficient historical coverage retains the existing candidate fallback. Baseline and resource-reference predictions, scored ticket populations, exclusive/private output, selection diagnostics and no-rollout flags are unchanged. Sparse or empty evaluation holdouts remain visible; no window is moved to improve results.

For the declared baseline-profile training seed 9001, evaluation seeds 42/314/2718 and original default window, candidate-with-fallback MAE is 7.68 minutes (sequential), 6.00 (parallel), 19.52 (competing) and 161.99 (disrupted). Disrupted coverage remains fallback-only. The unchanged baseline MAEs are 6.40, 78.55, 107.73 and 161.99 respectively. These observations are one reproducible experiment, not grounds to select the training seed after seeing results or claim deployment performance.

Automated regressions compare CLI predictions with a model fitted exclusively from the declared training seed, verify shared model/coverage lineage, unchanged baseline/resource populations, invalid and modulo-wrap seed rejection, and sensitivity-profile sparse-history fallback. Resource authority, privacy/capture approvals, service-start evidence and live rollout remain separate gates.
