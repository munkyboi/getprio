BEGIN;

CREATE TABLE IF NOT EXISTS group_funded_booking_items (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  location_service_id BIGINT REFERENCES location_services(id) ON DELETE SET NULL,
  service_name_snapshot TEXT NOT NULL,
  service_slug_snapshot TEXT NOT NULL,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  price_amount_cents INTEGER NOT NULL CHECK (price_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at),
  UNIQUE (campaign_id, service_id, scheduled_start_at)
);

CREATE INDEX IF NOT EXISTS group_funded_booking_items_campaign_idx
  ON group_funded_booking_items (campaign_id, sort_order, id);

CREATE INDEX IF NOT EXISTS group_funded_booking_items_capacity_idx
  ON group_funded_booking_items (tenant_id, location_id, service_id, scheduled_start_at, scheduled_end_at);

ALTER TABLE group_funded_capacity_holds
  ADD COLUMN IF NOT EXISTS group_funded_booking_item_id BIGINT REFERENCES group_funded_booking_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS group_funded_capacity_holds_item_idx
  ON group_funded_capacity_holds (group_funded_booking_item_id)
  WHERE group_funded_booking_item_id IS NOT NULL;

INSERT INTO group_funded_booking_items (
  campaign_id,
  tenant_id,
  location_id,
  service_id,
  location_service_id,
  service_name_snapshot,
  service_slug_snapshot,
  booking_quantity,
  price_amount_cents,
  currency,
  execution_mode,
  scheduled_start_at,
  scheduled_end_at,
  sort_order
)
SELECT
  campaign.id,
  campaign.tenant_id,
  campaign.location_id,
  campaign.service_id,
  campaign.location_service_id,
  campaign.service_name_snapshot,
  campaign.service_slug_snapshot,
  campaign.booking_quantity,
  campaign.target_amount_cents,
  campaign.currency,
  'parallel',
  campaign.scheduled_start_at,
  campaign.scheduled_end_at,
  0
FROM group_funded_bookings campaign
WHERE NOT EXISTS (
  SELECT 1
  FROM group_funded_booking_items item
  WHERE item.campaign_id = campaign.id
);

UPDATE group_funded_capacity_holds hold
SET group_funded_booking_item_id = item.id
FROM group_funded_booking_items item
WHERE hold.group_funded_booking_item_id IS NULL
  AND item.campaign_id = hold.campaign_id
  AND item.service_id = hold.service_id
  AND item.scheduled_start_at = hold.scheduled_start_at;

DROP TRIGGER IF EXISTS set_group_funded_booking_items_updated_at ON group_funded_booking_items;
CREATE TRIGGER set_group_funded_booking_items_updated_at
BEFORE UPDATE ON group_funded_booking_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
