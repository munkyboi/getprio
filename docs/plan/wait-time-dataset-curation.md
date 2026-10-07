# Offline wait-time dataset curation

This slice separates explicitly declared manual-test or data-quality windows from a private exported dataset. It does not identify test tickets automatically, verify the remaining traffic, train a model, or change customer estimates.

## Operator workflow

1. Preserve the original `wait-time-dataset-v1` export outside Git and public web roots.
2. Review operational records and declare exclusions before examining candidate holdout errors. Use the correct scope and explicit timezone. Do not invent windows to improve accuracy scores.
3. Save a private JSON manifest containing only `manifestVersion` and `windows`. Each window contains exactly `scopeKey`, `from`, `to`, and `reason` (`manual_test` or `data_quality`). Windows must fall within the original export and refer to a scope present in its samples.
4. Run the curation command with a new output filename. Review the per-scope counts and declarations before using the retained dataset.
5. Use that dataset for a new offline experiment with a preselected training cutoff and holdout end. The model artifact records the SHA256 of the actual dataset bytes, linking the experiment to this exact input without copying arbitrary metadata.

Illustrative manifest only; these dates are not verified test-session boundaries:

```json
{
  "manifestVersion": "wait-time-exclusions-v1",
  "windows": [
    {
      "scopeKey": "vendors:5:5",
      "from": "2026-10-06T06:00:00Z",
      "to": "2026-10-06T07:00:00Z",
      "reason": "manual_test"
    }
  ]
}
```

```sh
cd /var/www/getprio
node scripts/wait-time-curate.mjs \
  --dataset /root/wait-time-dataset.json \
  --exclusions /root/wait-time-exclusions.json \
  --output /root/wait-time-dataset-curated.json
```

## Exclusion semantics and evidence

A ticket is excluded in full when its captured observation-to-call interval intersects a declared window for its scope: `sampledAt < to && calledAt >= from`. Windows include their start and exclude their end. Calls exactly at a window start are excluded, including zero-wait observations; tickets first observed exactly at the end are retained unless another window matches. This conservative policy may also exclude genuine customers waiting during a manual-test session. Review that tradeoff rather than treating interval overlap as proof the ticket was a test.

Overlapping windows are allowed. Each ticket counts once in excluded totals; it can count under both reasons. Scopes absent from the manifest remain intact. All samples can be excluded, yielding an empty diagnostic dataset; no training readiness claim follows.

The output preserves the original source, closed export window, capture time, feature-exclusion count, pseudonymous ticket keys and retained features. Additional unrecognized sample fields are not copied. `curation` records source and manifest byte hashes, declarations, curation time, input/retained/excluded counts and per-scope counts. These hashes pin inputs; they do not attest their truth or integrity before the operator obtained them.

Provenance stays `unverified-operational-data`, with `provenanceVerified: false`. Manual traffic outside declared windows can remain. Never combine independently salted exports. Chained curation is rejected: revise the manifest and start again from the original export so the full exclusion history stays reviewable.

Inputs are regular files bounded to 64 MiB for the dataset and 1 MiB for the manifest, with at most 1,000 windows and 100,000 samples. Unknown manifest fields, duplicate options/windows, invalid labels/features/timestamps and duplicate ticket keys are rejected. JSON objects should have unique property names; ordinary JSON parsing uses the last value for repeated names. Outputs use exclusive creation and mode `0600`; existing files, including the original dataset, are never overwritten. Restrict parent directory access and manifest permissions too.

## Acceptance gates

Syntax and lint checks cover authoring only. Operator execution and review of real exclusion declarations remain runtime gates. Curation does not increase eligible history, establish representative coverage, calibrate uncertainty, prove model accuracy or authorize rollout. Existing shadow capture and public baseline estimates remain as configured.
