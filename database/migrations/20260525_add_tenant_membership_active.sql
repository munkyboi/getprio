ALTER TABLE IF EXISTS tenant_memberships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_active
  ON tenant_memberships (tenant_id, is_active);
