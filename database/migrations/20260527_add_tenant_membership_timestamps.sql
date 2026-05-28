ALTER TABLE tenant_memberships
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE tenant_memberships
SET
  created_at = DATE '2026-05-27',
  updated_at = DATE '2026-05-27';

DROP TRIGGER IF EXISTS set_tenant_memberships_updated_at ON tenant_memberships;
CREATE TRIGGER set_tenant_memberships_updated_at
BEFORE UPDATE ON tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
