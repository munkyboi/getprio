BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS service_priority_band TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS rejoin_deadline_at TIMESTAMPTZ;

UPDATE tickets
SET service_priority_band = CASE
  WHEN carried_over_at IS NOT NULL OR COALESCE(carry_over_count, 0) > 0 THEN 'carry_over'
  ELSE 'normal'
END
WHERE service_priority_band IS NULL
   OR service_priority_band NOT IN ('carry_over', 'recovery', 'normal');

COMMIT;
