BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS public_profile_description TEXT,
  ADD COLUMN IF NOT EXISTS public_profile_category TEXT,
  ADD COLUMN IF NOT EXISTS public_profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS vendor_approval_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_vendor_approval_status_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_vendor_approval_status_check
  CHECK (vendor_approval_status IN ('pending', 'approved', 'rejected', 'suspended'));

CREATE INDEX IF NOT EXISTS tenants_public_profile_discovery_idx
  ON tenants (vendor_approval_status, public_profile_enabled, is_active, name);

COMMIT;
