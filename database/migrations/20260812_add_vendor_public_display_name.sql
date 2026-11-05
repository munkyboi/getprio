BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS public_profile_display_name TEXT;

COMMIT;
