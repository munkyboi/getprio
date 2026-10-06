# Controlled vendor shadow sampling

Status: disabled by default. The private adapter is connected only to successful independent vendor baseline captures after their transaction commits. No candidate is loaded into a public prediction path and customer estimates remain `baseline-v1`. Model rollout remains on hold. Operator activation and live sampling execution are separate acceptance steps after deployment; this change does not enable them automatically.

## Observation contract

The existing focus-ticket snapshot computes the baseline, then asynchronously persists its observation. If that independent transaction inserts a new `baseline-v1` observation, the repository schedules optional background work after COMMIT. Observations inserted using another caller's transaction client are not scheduled: this repository cannot determine when that external transaction commits. Existing callers, boolean return values, queue responses, ordering and call/censor transactions are preserved.

The sampler re-reads canonical persisted features and rechecks tenant/location scope. It records one comparison per baseline sample in `wait_time_shadow_samples`, linked by a foreign key. Existing baseline outcomes remain the authoritative time-to-call/censor labels; audit queries join them rather than adding independent lifecycle updates. A deleted baseline sample cascades its comparison. Baseline training datasets, sample counts and coverage remain separate and unchanged.

This samples **existing captured focus-ticket observations**, not every issued ticket. It introduces no new observation for printed tickets or customers who never open a ticket view, and is not a representative ticket census. Duplicate baseline observations in the same five-minute bucket do not produce another job. A model rotation within that bucket does not create a second comparison. Shadow selection does not add tickets to training or move fixed holdout data into history.

## Admission and resource limits

- Vendor/location allowlist only. Developer API sandbox capture is unchanged.
- Deterministic selection by ticket ID, five-minute sample bucket and pinned artifact digest; default 10 percent of admitted baseline captures.
- One job in flight per API process, no waiting job queue. Busy observations are dropped.
- At most six admitted jobs per rolling minute per process by default, configurable from 1 to 60. Sampling percentage is configurable from 1 to 100.
- Provider deadline defaults to 100 ms; live sampler configuration allows 1 to 1,000 ms. The existing adapter discards late results and requests cooperative cancellation; it is not a hard synchronous CPU limit.
- Shadow database transactions use 1,000 ms statement and 250 ms lock timeouts. Inference runs outside database transactions. Pool acquisition uses the existing pool; only one sampling job can be waiting/in flight per process.

Limits are process-local, not cluster-wide. They do not guarantee a global rate when adding API workers/droplets. Skipped work is not retried, and connection/persistence errors are not promoted to queue-response errors. Sanitized warnings omit identities, features, paths, credentials and raw provider errors. In-memory counters track admission/drop/error paths; they reset on restart and are not exposed by a public endpoint.

## Configuration and artifact binding

All configuration is private operator configuration. Both existing `WAIT_TIME_PREDICTION_CAPTURE_ENABLED=true` and new `WAIT_TIME_SHADOW_ENABLED=true` are required. The current deployment leaves shadow disabled.

| Variable | Meaning |
| --- | --- |
| `WAIT_TIME_SHADOW_NAMESPACE` | Required private pilot label, 1–100 letters/digits/underscores/hyphens. |
| `WAIT_TIME_SHADOW_DATABASE_HOST` / `WAIT_TIME_SHADOW_DATABASE_NAME` | Required expected hostname/database matching configured `DATABASE_URL`; actual `current_database()` is also checked when reading the baseline. No URL credentials are logged. |
| `WAIT_TIME_SHADOW_SCOPES` | Required comma-separated vendor/location keys, at most 20, e.g. `vendors:5:5`. |
| `WAIT_TIME_SHADOW_ARTIFACT_PATH` | Required absolute private regular file, readable by the API OS user; no group/other permissions or symlinks. |
| `WAIT_TIME_SHADOW_ARTIFACT_SHA256` | Required operator-selected 64-character lowercase digest. |
| `WAIT_TIME_SHADOW_SAMPLING_PERCENT` | Default 10. |
| `WAIT_TIME_SHADOW_MAX_PER_MINUTE` | Default 6 per process. |
| `WAIT_TIME_SHADOW_TIMEOUT_MS` | Default 100. |
| `DEPLOY_SHA` | Required deployed commit identifier, supplied by the existing deployment workflow. |

The configured hostname/database check is a guard against target mistakes, not proof of physical isolation or artifact provenance. The operator explicitly binds a selected artifact digest to this database/namespace/scope allowlist. Existing experiment artifacts are not cryptographically attested to a database instance and include manual tests; they cannot establish production accuracy. These checks do not approve rollout or supply authenticated cross-environment model promotion.

Configuration is captured on the first baseline scheduling attempt. Successful artifact bytes are cached for the process lifetime and validated against the pinned digest on each comparison. Configuration changes, model rotation or repair of a cached invalid artifact require an API restart. Missing/invalid configuration disables sampling with a fixed warning, without preventing baseline capture. File/provider failures are recorded as adapter fallback when persistence succeeds. Candidate estimates outside the numeric storage range are recorded as fallback, without clipping/publishing a value.

## Storage and read-only audit

The new migration creates a separate comparison table and recorded-time index. Its schema stores source/namespace, deployment and expected/validated artifact digests, sampling percent, fallback/candidate result, successful candidate predictor version, and inference latency. It adds no contact details, customer names, booking references, feature/context payloads, or separate mutable call timestamps.

Comparison retention follows baseline observation lifetime through cascading deletion; the 30-day audit window is **not physical deletion**. Broader pilot activation must establish an operational retention/cleanup schedule, artifact ownership/reload procedure, rate allocation across API workers, and process monitoring. No standalone retention scheduler is added by this slice. Keep pilot artifacts outside Git and public web roots.

The existing vendor audit adds `shadowCapture`, bounded to comparisons recorded in the last 30 days. Summaries separate fallback from candidate observations, identify namespace/deployment/artifact and scope, report pending/called/censored joined labels and inference latency, and compute paired MAEs only on the **same called observations with a successful candidate**. Repeated observations are not distinct tickets or an independent temporal holdout. Null candidate metrics are expected with zero trained scopes. Group output is limited to 1,000 entries with an explicit truncation flag.

```sh
cd /var/www/getprio
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/wait-time-prediction-audit.mjs \
  --scope vendors --vendor-slug pickle-bois-burgadols
```

An empty report after deployment is expected while sampling is disabled. It does not verify the running process configuration. Missing comparisons can also reflect allowlist, sampling, rate/concurrency limits, deleted baseline samples, or errors. Audit CLI environment values are not live API-process evidence.

## Acceptance and next gates

Syntax, lint, backend type checking, shell syntax and diff checks are authoring checks; no local tests, database migration or live sampling are run while authoring. Deployment must apply the migration and pass schema/health checks. Operator-controlled activation then needs live evidence of baseline capture, private fallback/candidate persistence and joined outcomes without customer response changes. The current zero-trained-scope artifact can exercise sparse-history fallback, but cannot demonstrate trained-candidate accuracy.

Representative observations/provenance, fixed independent evaluation, uncertainty calibration, trusted artifact deployment binding, monitored scope controls and a separate reviewed publication release remain required. Draft service plans and resource pools are not actual occupancy. This slice does not implement allocation, vendor dashboard UI, a remote inference provider, or customer prediction promotion.
