ALTER TABLE IF EXISTS tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;

ALTER TABLE IF EXISTS tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'staff'));

ALTER TABLE IF EXISTS tenant_staff_invitations
  DROP CONSTRAINT IF EXISTS tenant_staff_invitations_role_check;

ALTER TABLE IF EXISTS tenant_staff_invitations
  ADD CONSTRAINT tenant_staff_invitations_role_check
  CHECK (role IN ('admin', 'staff'));
