# Private resource inference boundary

`createResourceShadowInference({ enabled, expectedScope, readSnapshot, timeoutMs, maximumAgeMs, forecastMinutes })` creates a scope-bound async `inferResourceServiceStart({ targetWorkRef })`. It is disabled by default and has no API/queue hook, database import, capture table, environment switch, model call or public response integration. Customer estimates and rollout approval remain unchanged.

## Provider contract

The server supplies the exact tenant/location/queue kind/source binding, independently of user input. Configuration uses the accepted v1 consumer validation, including its exact scope shape, identifier and maximum-age limits. The scope is copied and frozen at construction. The provider receives that scope, the fixed requested forecast horizon and an AbortSignal; it must authorize the read and enforce bounded I/O and cancellation itself. It returns at most 2 MiB of UTF-8 Buffer bytes for the accepted snapshot envelope. The wrapper rejects objects or oversized buffers and copies bytes before validation/projection. Shape validation cannot prove authorization or provenance.

The existing internal snapshot producer from PR #323 returns an object and always reports not_ready. A future runtime adapter must serialize its authorized, bounded envelope into bytes and implement the required window/inventory semantics before any ready forecast is possible. This slice does not adapt audit output, synthesize ready inventory, activate tracking, or mark writer coverage complete. Customer booking creation from PR #324 is the first scoped writer; reservation/session/configuration lifecycle coverage is still separate runtime work.

## Deadline and load behavior

Timeout defaults to 100 ms and is restricted to 1–1000 ms. The requested horizon is 5–480 minutes; freshness defaults to 1000 ms within the existing 1–5000 ms contract. A monotonic deadline includes provider wait, byte copy, validation, projection and final freshness validation. On timeout the result is unavailable and the provider is asked to abort. Synchronous CPU cannot be preempted: an over-deadline result is discarded afterward, and the projection's existing operation/inventory limits remain necessary. This is not a hard event-loop latency guarantee.

One outstanding read is allowed per instance. A provider that ignores abort keeps that slot until its promise settles; further calls return snapshot_provider_busy instead of adding abandoned reads. Providers must have their own database/transport timeouts. This local bound is not global admission control across instances; future runtime wiring must reuse instances and bound scopes/concurrency. Caller cancellation and process/service isolation remain future integration requirements.

A success is revalidated for snapshot age and horizon at acceptance, and includes acceptedAt separately from forecastedAt. No forecast is recomputed using actual future outcomes. Validation does not guarantee ledger revisions remain current after read; future live capture/dispatch integration needs its own revision/race policy. Expected completion never releases an actual allocation.

## Outputs and next gates

Disabled/busy/invalid-target attempts do not call the provider. Provider errors are sanitized to snapshot_provider_error. Timeout, invalid bytes and expiry return null service-start prediction fields. Producer not-ready reasons and pure projection diagnostics remain private. Every result targets time_to_actual_service_start and sets customerEstimateChanged, rolloutApproved and uncertaintyCalibrated to false. No baseline time-to-call value is relabelled as service-start wait.

Next gates: complete authoritative writer coverage and reconciliation; implement the producer's ready inventory and byte adapter; verify cancellation/concurrency/late-result behavior; add bounded private capture paired with actual service starts; evaluate support/fallback coverage and performance before any customer promotion. Static syntax/lint checks only were run while authoring this slice; no local tests, operational forecasts or live hooks were executed.

A separate [read-only CLI readiness preflight](resource-shadow-audit.md) now connects the existing not-ready producer to this boundary. It does not add an API caller, ready inventory adapter, sample capture or forecast publication.

[Offline service-start evaluation](resource-shadow-evaluation.md) defines the separate paired observation report. It has no capture/export hook and rejects the existing time-to-call datasets.
