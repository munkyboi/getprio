BEGIN;

-- Developer API resources are deliberately separate from vendor tenants,
-- locations, queue days, and ticket records. The service may share the
-- application database, but it must not inherit vendor plan or customer data.
ALTER TABLE developer_api_keys
  DROP CONSTRAINT IF EXISTS developer_api_keys_scopes_check;

ALTER TABLE developer_api_keys
  ADD CONSTRAINT developer_api_keys_scopes_check CHECK (
    scopes <@ ARRAY[
      'profiles:read', 'profiles:write',
      'queues:read', 'queues:write',
      'webhooks:read', 'webhooks:write'
    ]::TEXT[]
  );

CREATE TABLE IF NOT EXISTS developer_api_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  directory_status TEXT NOT NULL DEFAULT 'private'
    CHECK (directory_status IN ('private', 'draft', 'pending_review', 'approved', 'changes_requested', 'rejected', 'withdrawn', 'removed')),
  directory_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_project_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS developer_api_profiles_scope_idx
  ON developer_api_profiles (developer_project_id, environment, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_api_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_api_profile_id UUID NOT NULL REFERENCES developer_api_profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  session_state TEXT NOT NULL DEFAULT 'closed' CHECK (session_state IN ('open', 'paused', 'closing', 'closed')),
  intake_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  joining_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority_ratio INTEGER NOT NULL DEFAULT 3 CHECK (priority_ratio BETWEEN 1 AND 20),
  resource_version BIGINT NOT NULL DEFAULT 1 CHECK (resource_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_api_profile_id, slug)
);

CREATE INDEX IF NOT EXISTS developer_api_queues_profile_state_idx
  ON developer_api_queues (developer_api_profile_id, session_state, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_api_queue_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_api_queue_id UUID NOT NULL REFERENCES developer_api_queues(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_api_queue_id, slug)
);

CREATE TABLE IF NOT EXISTS developer_api_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  developer_api_profile_id UUID NOT NULL REFERENCES developer_api_profiles(id) ON DELETE RESTRICT,
  developer_api_queue_id UUID NOT NULL REFERENCES developer_api_queues(id) ON DELETE RESTRICT,
  developer_api_queue_counter_id UUID REFERENCES developer_api_queue_counters(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL CHECK (char_length(ticket_number) BETWEEN 1 AND 40),
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  display_label TEXT CHECK (display_label IS NULL OR char_length(display_label) BETWEEN 1 AND 120),
  external_reference TEXT CHECK (external_reference IS NULL OR char_length(external_reference) BETWEEN 1 AND 160),
  recipient_email TEXT CHECK (recipient_email IS NULL OR char_length(recipient_email) <= 320),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'served', 'skipped', 'cancelled', 'unserved', 'expired')),
  status_reason TEXT CHECK (status_reason IS NULL OR char_length(status_reason) <= 120),
  linked_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  linking_disabled_at TIMESTAMPTZ,
  customer_data_deleted_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  unserved_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  resource_version BIGINT NOT NULL DEFAULT 1 CHECK (resource_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_api_queue_id, sequence),
  UNIQUE (developer_api_queue_id, ticket_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS developer_api_tickets_external_reference_idx
  ON developer_api_tickets (developer_project_id, environment, external_reference)
  WHERE external_reference IS NOT NULL AND customer_data_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS developer_api_tickets_queue_status_idx
  ON developer_api_tickets (developer_api_queue_id, status, sequence);

CREATE INDEX IF NOT EXISTS developer_api_tickets_scope_idx
  ON developer_api_tickets (developer_project_id, environment, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_api_ticket_events (
  id BIGSERIAL PRIMARY KEY,
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  developer_api_profile_id UUID NOT NULL REFERENCES developer_api_profiles(id) ON DELETE RESTRICT,
  developer_api_queue_id UUID NOT NULL REFERENCES developer_api_queues(id) ON DELETE RESTRICT,
  developer_api_ticket_id UUID REFERENCES developer_api_tickets(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  from_status TEXT,
  to_status TEXT,
  resource_version BIGINT NOT NULL CHECK (resource_version > 0),
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS developer_api_ticket_events_ticket_idx
  ON developer_api_ticket_events (developer_api_ticket_id, id);

CREATE INDEX IF NOT EXISTS developer_api_ticket_events_scope_idx
  ON developer_api_ticket_events (developer_project_id, environment, id);

CREATE TABLE IF NOT EXISTS developer_api_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  developer_api_key_id UUID NOT NULL REFERENCES developer_api_keys(id) ON DELETE RESTRICT,
  operation_scope TEXT NOT NULL CHECK (char_length(operation_scope) BETWEEN 1 AND 120),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash TEXT NOT NULL CHECK (char_length(request_hash) = 64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  response_status INTEGER,
  response_body JSONB,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_api_key_id, operation_scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS developer_api_operations_expiry_idx
  ON developer_api_operations (expires_at);

CREATE TABLE IF NOT EXISTS developer_sandbox_daily_allowances (
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  allowance_date DATE NOT NULL,
  issued_tickets INTEGER NOT NULL DEFAULT 0 CHECK (issued_tickets BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (developer_project_id, allowance_date)
);

COMMIT;
