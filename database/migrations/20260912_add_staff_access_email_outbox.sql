-- Staff access mutations and their notification intents commit together.
CREATE TABLE IF NOT EXISTS staff_access_email_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('member', 'owner')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')), -- NOSONAR: SQL cannot define a reusable string constant.
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(event_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS staff_access_email_pending_idx
  ON staff_access_email_outbox(available_at, id) WHERE status = 'pending';
