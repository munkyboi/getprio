BEGIN;

ALTER TABLE account_deletion_requests
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (scan_status IN ('not_started','queued','running','report_ready','needs_attention')),
  ADD COLUMN IF NOT EXISTS scan_report JSONB,
  ADD COLUMN IF NOT EXISTS scan_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scan_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scan_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scan_next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS scan_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scan_error_code TEXT,
  ADD COLUMN IF NOT EXISTS cleanup_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (cleanup_status IN ('not_started','queued','running','needs_attention','completed')),
  ADD COLUMN IF NOT EXISTS cleanup_selection JSONB,
  ADD COLUMN IF NOT EXISTS cleanup_report JSONB,
  ADD COLUMN IF NOT EXISTS cleanup_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleanup_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_status TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (report_status IN ('not_ready','ready','sending','sent','needs_attention')),
  ADD COLUMN IF NOT EXISTS report_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_error_code TEXT;

CREATE INDEX IF NOT EXISTS account_deletion_scan_due_idx
  ON account_deletion_requests(scan_next_attempt_at)
  WHERE scan_status IN ('queued','running');

COMMIT;
