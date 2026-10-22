# Private shadow inference foundation

Status: adapter and private CLI, with [controlled vendor shadow sampling](wait-time-shadow-sampling.md) available as a separate disabled-by-default capture path. No candidate is selected by a public/mobile prediction response. Live estimates remain `baseline-v1`; model rollout remains on hold. Operator activation and runtime sampling verification are separate gates.

## Backend boundary

`createWaitTimeShadowInference` returns an asynchronous inference function. Its `prediction` field always contains the existing baseline result. A separate `shadow` field carries an optional candidate estimate, difference from baseline, predictor version, artifact digest, or bounded fallback reason. No failure publishes the candidate or changes a queue decision. Both `customerEstimateChanged` and `rolloutApproved` remain false.

Configuration is private and server-owned: `enabled` (default false), source, allowed scope keys, expected artifact SHA-256, provider, timeout, and minimum training count (default 30). The provider receives only an abort signal, not customer identity, queue feature payloads, or client-selected filenames. It returns artifact bytes. This boundary can later support a reviewed cache or separate service without putting inference in a browser/mobile app. This slice implements only a private local file provider.

Source and scope are selected from authenticated server context in any future API integration. The current CLI explicitly configures one scope for diagnostics. Vendor scopes are vendor/location positive integer IDs; sandbox scopes are project/queue UUIDs. Unknown/deleted vendor locations and scopes outside the allowlist fall back without loading an artifact. Future routes must never let a customer choose the allowlist, source, artifact path, digest, threshold, or shadow enablement.

## Artifact validation

Only `wait-time-experiment-v1` artifacts from the configured source are accepted. The model must match `queue-pace-median-v1` and the observation-to-call target, use an explicit timezone in its cutoff, and meet the configured minimum historical ticket count. Each scope rate must have a valid source-scoped key, finite nonnegative pace, and a safe ticket count. Duplicate scope rates, unsupported versions, mismatched source/digest, and invalid fields fail closed. A validated model is copied into frozen objects before use; unrelated artifact content is not passed to the predictor.

The expected digest pins the exact operator-selected artifact bytes. It does **not** establish trusted provenance, database isolation, representativeness, accuracy, or rollout permission. An artifact with zero trained scopes remains a valid experiment and produces `insufficient_scope_history` for an otherwise supported observation. The current exported dataset contains manual tests and is not a production accuracy benchmark.

The local provider requires an absolute operator-configured path to a regular file with no group/other permissions. It rejects symbolic links, special files, and artifacts above 1 MiB. Reads are bounded even if the file grows after metadata inspection, and file handles close on success/failure. Keep files outside public web roots and Git. The CLI does not write or upload artifacts and does not need database credentials.

## Failure and timing behavior

The provider deadline defaults to 100 ms and is configurable from 1 to 5,000 ms. Timeout, unreadable files, malformed artifacts, invalid model parameters, missing scope history, unsupported queue contexts, observations before training cutoff, and nonfinite candidate output retain baseline. Error responses use fixed reason codes and do not include raw filesystem/provider errors or paths.

The adapter races asynchronous loading with a timer, requests cooperative cancellation on timeout/completion, and discards results that arrive after the deadline, including results made late by synchronous validation/prediction. JavaScript timers cannot interrupt blocking synchronous provider work; this is not a hard CPU execution limit. A future provider must enforce its own response-size/cancellation limits, and CPU-heavy inference needs process/service isolation. No network endpoint or provider credentials are configured here.

The baseline observation time and candidate feature values are captured before asynchronous work. Candidate input contains position, average service minutes, priority band, pause state and observation time. The adapter does not infer occupancy from bookings or plans. Calling and service start remain separate forecast targets.

## Private runtime acceptance

After deployment, inspect the artifact digest on the droplet:

```sh
sha256sum /root/wait-time-experiment-coverage.json
```

Then copy its 64-character digest into this diagnostic command. The observation below is a synthetic input for exercising the adapter, not a new performance evaluation:

```sh
cd /var/www/getprio
node scripts/wait-time-shadow.mjs \
  --artifact /root/wait-time-experiment-coverage.json \
  --artifact-sha256 COPY_THE_64_CHARACTER_DIGEST \
  --source vendors \
  --scope-key vendors:5:5 \
  --position 2 \
  --average-service-minutes 60 \
  --observed-at 2026-10-06T10:00:00Z \
  --timeout-ms 1000
```

For the existing zero-trained-scope artifact, expect baseline 120 minutes and shadow fallback `insufficient_scope_history`. Optional `--priority-band` accepts existing baseline bands; `--queue-paused` accepts `true` or `false`. They exercise existing context fallback, not live queue state. Provider fallback is a successful diagnostic report; inspect its reason rather than treating exit code zero as candidate inference proof. Syntax/lint/type checks do not establish runtime fallback/deadline behavior; private execution remains an acceptance gate.

## Next integration gates

Representative data and fixed independent evaluation remain necessary for candidate assessment. A live shadow release additionally needs artifact-to-deployment/database binding, sampling/rate limits, cache/reload policy, operational monitoring, and capture retention/outcome semantics. Customer publication requires separate reviewed rollout controls and uncertainty/performance evidence. This adapter and its allowlist/digest checks do not satisfy those gates.
