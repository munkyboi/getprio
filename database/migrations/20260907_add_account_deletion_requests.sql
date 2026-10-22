BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS account_deletion_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','review_required','completed')),
 requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 due_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
 completed_at TIMESTAMPTZ,
 contact_email TEXT,
 retention_notice TEXT,
 policy_version TEXT NOT NULL DEFAULT '2026-09-07',
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_error_code TEXT,
 acknowledgement_sent_at TIMESTAMPTZ,
 completion_sent_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_deletion_due_idx ON account_deletion_requests(next_attempt_at) WHERE status <> 'completed';
CREATE TABLE IF NOT EXISTS account_deletion_tasks (
 id BIGSERIAL PRIMARY KEY,
 request_id UUID NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
 evidence TEXT,
 completed_at TIMESTAMPTZ,
 UNIQUE(request_id,kind)
);
COMMIT;
