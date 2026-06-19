ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;

ALTER TABLE tenant_memberships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'staff'));
