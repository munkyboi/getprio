BEGIN;

CREATE TABLE IF NOT EXISTS ticket_mobile_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_mobile_links_active_ticket_idx
  ON ticket_mobile_links (ticket_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ticket_mobile_links_scope_idx
  ON ticket_mobile_links (developer_project_id, environment, created_at DESC);

CREATE INDEX IF NOT EXISTS ticket_mobile_links_expiry_idx
  ON ticket_mobile_links (expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMIT;
