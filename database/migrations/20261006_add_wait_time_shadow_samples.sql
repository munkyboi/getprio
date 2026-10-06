BEGIN;

CREATE TABLE IF NOT EXISTS wait_time_shadow_samples (
  baseline_sample_id BIGINT PRIMARY KEY REFERENCES wait_time_prediction_samples(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source = 'vendors'),
  namespace TEXT NOT NULL CHECK (char_length(namespace) BETWEEN 1 AND 100),
  deployment_sha TEXT NOT NULL CHECK (deployment_sha ~ '^[a-f0-9]{40}$'),
  expected_artifact_sha256 TEXT NOT NULL CHECK (expected_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  validated_artifact_sha256 TEXT CHECK (validated_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  sampling_percent INTEGER NOT NULL CHECK (sampling_percent BETWEEN 1 AND 100),
  used_fallback BOOLEAN NOT NULL,
  fallback_reason TEXT CHECK (char_length(fallback_reason) BETWEEN 1 AND 100),
  candidate_wait_minutes NUMERIC(10, 2),
  inference_latency_ms NUMERIC(10, 2) NOT NULL CHECK (inference_latency_ms >= 0 AND inference_latency_ms::text <> 'NaN'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((used_fallback AND fallback_reason IS NOT NULL AND candidate_wait_minutes IS NULL)
    OR (NOT used_fallback AND fallback_reason IS NULL AND candidate_wait_minutes IS NOT NULL AND candidate_wait_minutes >= 0
      AND candidate_wait_minutes::text <> 'NaN' AND validated_artifact_sha256 IS NOT NULL
      AND validated_artifact_sha256 = expected_artifact_sha256))
);

CREATE INDEX IF NOT EXISTS wait_time_shadow_samples_recorded_idx ON wait_time_shadow_samples(recorded_at);

COMMIT;
