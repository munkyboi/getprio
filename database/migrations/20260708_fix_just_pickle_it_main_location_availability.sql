WITH target_tenant AS (
  SELECT id
  FROM tenants
  WHERE slug = 'just-pickle-it'
  LIMIT 1
),
target_location AS (
  SELECT id
  FROM store_locations
  WHERE tenant_id = (SELECT id FROM target_tenant)
    AND slug = 'main'
  LIMIT 1
),
target_services AS (
  SELECT id
  FROM vendor_services
  WHERE tenant_id = (SELECT id FROM target_tenant)
    AND slug IN ('court-1', 'court-2', 'court-3', 'court-4', 'vip-court')
    AND is_active = TRUE
)
INSERT INTO vendor_availability_blocks (
  tenant_id,
  location_id,
  service_id,
  weekday,
  starts_at,
  ends_at,
  capacity,
  is_active,
  notes
)
SELECT
  blocks.tenant_id,
  blocks.location_id,
  services.id,
  blocks.weekday,
  blocks.starts_at,
  blocks.ends_at,
  blocks.capacity,
  blocks.is_active,
  blocks.notes
FROM vendor_availability_blocks blocks
JOIN target_location location ON location.id = blocks.location_id
CROSS JOIN target_services services
WHERE blocks.tenant_id = (SELECT id FROM target_tenant)
  AND blocks.location_id = (SELECT id FROM target_location)
  AND blocks.service_id IS NULL;

WITH target_tenant AS (
  SELECT id
  FROM tenants
  WHERE slug = 'just-pickle-it'
  LIMIT 1
),
target_location AS (
  SELECT id
  FROM store_locations
  WHERE tenant_id = (SELECT id FROM target_tenant)
    AND slug = 'main'
  LIMIT 1
)
DELETE FROM vendor_availability_blocks
WHERE tenant_id = (SELECT id FROM target_tenant)
  AND location_id = (SELECT id FROM target_location)
  AND service_id IS NULL;
