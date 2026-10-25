BEGIN;
-- Capability remains server-default-OFF. This removes only the historical draft-only check.
-- Existing FALSE default, capacity/uniqueness/scoped FK constraints remain unchanged.
ALTER TABLE location_resource_pools DROP CONSTRAINT IF EXISTS resource_pools_tracking_disabled_check;
COMMIT;
