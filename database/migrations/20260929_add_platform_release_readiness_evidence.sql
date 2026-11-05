CREATE TABLE IF NOT EXISTS platform_release_readiness_evidence (
  id BIGSERIAL PRIMARY KEY,
  workflow_run_id BIGINT NOT NULL UNIQUE,
  deployment_sha CHAR(40) NOT NULL CHECK (deployment_sha ~ '^[0-9a-f]{40}$'),
  workflow_url TEXT NOT NULL CHECK (workflow_url ~ '^https://'),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_release_readiness_evidence_observed_idx
  ON platform_release_readiness_evidence (observed_at DESC, id DESC);
