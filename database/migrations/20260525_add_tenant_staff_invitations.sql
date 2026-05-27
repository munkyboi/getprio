CREATE TABLE IF NOT EXISTS tenant_staff_invitations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  accepted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_staff_invitations_pending_email
  ON tenant_staff_invitations (tenant_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tenant_staff_invitations_tenant_status
  ON tenant_staff_invitations (tenant_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_staff_invitations_token_hash
  ON tenant_staff_invitations (token_hash);

DROP TRIGGER IF EXISTS set_tenant_staff_invitations_updated_at ON tenant_staff_invitations;
CREATE TRIGGER set_tenant_staff_invitations_updated_at
BEFORE UPDATE ON tenant_staff_invitations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
