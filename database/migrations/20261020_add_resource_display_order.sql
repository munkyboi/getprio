BEGIN;

ALTER TABLE location_resource_pools
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0);

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, location_id ORDER BY id) - 1 AS position
  FROM location_resource_pools
)
UPDATE location_resource_pools AS pools
SET display_order = ranked.position
FROM ranked
WHERE ranked.id = pools.id;

ALTER TABLE resource_pool_members
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0);

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, location_id, pool_id ORDER BY name, id) - 1 AS position
  FROM resource_pool_members
)
UPDATE resource_pool_members AS members
SET display_order = ranked.position
FROM ranked
WHERE ranked.id = members.id;

COMMIT;
