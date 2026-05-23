ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS service_counter_id BIGINT REFERENCES service_counters(id) ON DELETE SET NULL;
