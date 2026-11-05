BEGIN;

ALTER TABLE store_hours
  DROP CONSTRAINT IF EXISTS store_hours_location_id_weekday_key;

CREATE INDEX IF NOT EXISTS idx_store_hours_location_weekday
  ON store_hours (location_id, weekday, opens_at, closes_at);

COMMIT;
