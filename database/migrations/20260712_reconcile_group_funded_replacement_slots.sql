ALTER TABLE group_funded_bookings
  ADD COLUMN IF NOT EXISTS replacement_scheduled_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_scheduled_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_proposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_proposed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_funded_bookings_replacement_slot_check'
  ) THEN
    ALTER TABLE group_funded_bookings
      ADD CONSTRAINT group_funded_bookings_replacement_slot_check CHECK (
        replacement_scheduled_start_at IS NULL
        OR replacement_scheduled_end_at IS NULL
        OR replacement_scheduled_start_at < replacement_scheduled_end_at
      );
  END IF;
END $$;
