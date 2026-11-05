BEGIN;

CREATE TABLE IF NOT EXISTS platform_help_center_revisions (
  revision BIGSERIAL PRIMARY KEY,
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_reason TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  published_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_help_center_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  published_revision BIGINT REFERENCES platform_help_center_revisions(revision) ON DELETE RESTRICT,
  draft_revision BIGINT REFERENCES platform_help_center_revisions(revision) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_help_center_revisions_created_idx
  ON platform_help_center_revisions (created_at DESC, revision DESC);

COMMIT;
