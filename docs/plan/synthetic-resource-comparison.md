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
