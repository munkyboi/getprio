CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  queue_prefix VARCHAR(4) NOT NULL DEFAULT 'P',
  average_service_minutes INTEGER NOT NULL DEFAULT 5 CHECK (average_service_minutes BETWEEN 1 AND 120),
  notification_threshold INTEGER NOT NULL DEFAULT 2 CHECK (notification_threshold BETWEEN 1 AND 10),
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_provider TEXT NOT NULL DEFAULT 'password',
  roles TEXT[] NOT NULL DEFAULT ARRAY['customer']::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  date_key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key, date_key)
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  lookup_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  notify_by_email BOOLEAN NOT NULL DEFAULT FALSE,
  notify_by_sms BOOLEAN NOT NULL DEFAULT FALSE,
  join_channel TEXT NOT NULL DEFAULT 'online',
  status TEXT NOT NULL DEFAULT 'waiting',
  notes TEXT,
  notified_almost_there_at TIMESTAMPTZ,
  notified_called_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date_key, sequence)
);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status_created_at
  ON tickets (tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_tickets_lookup_code
  ON tickets (lookup_code);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id
  ON tenant_memberships (user_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tenants_updated_at ON tenants;
CREATE TRIGGER set_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_counters_updated_at ON counters;
CREATE TRIGGER set_counters_updated_at
BEFORE UPDATE ON counters
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_tickets_updated_at ON tickets;
CREATE TRIGGER set_tickets_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
