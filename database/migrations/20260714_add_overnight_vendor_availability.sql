BEGIN;

ALTER TABLE vendor_availability_blocks
  ADD COLUMN IF NOT EXISTS ends_next_day BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'vendor_availability_blocks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%starts_at < ends_at%'
  LOOP
    EXECUTE format('ALTER TABLE vendor_availability_blocks DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE vendor_availability_blocks
  ADD CONSTRAINT vendor_availability_blocks_time_range_check
  CHECK (
    (ends_next_day AND starts_at > ends_at)
    OR (NOT ends_next_day AND starts_at < ends_at)
  );

COMMIT;
