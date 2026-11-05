BEGIN;

CREATE TABLE IF NOT EXISTS developer_webhook_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
  payload_version INTEGER NOT NULL DEFAULT 1 CHECK (payload_version > 0),
  event_types TEXT[] NOT NULL CHECK (cardinality(event_types) > 0),
  signing_secret_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  disabled_at TIMESTAMPTZ,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS developer_webhook_registrations_version_idx
  ON developer_webhook_registrations (developer_project_id, environment, lower(url), payload_version)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS developer_webhook_registrations_scope_idx
  ON developer_webhook_registrations (developer_project_id, environment, status, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES developer_webhook_registrations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_body TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retry', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registration_id, event_id)
);

CREATE INDEX IF NOT EXISTS developer_webhook_deliveries_dispatch_idx
  ON developer_webhook_deliveries (available_at, id)
  WHERE status IN ('pending', 'retry');

COMMIT;
