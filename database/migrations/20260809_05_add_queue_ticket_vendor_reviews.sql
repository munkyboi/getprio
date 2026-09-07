BEGIN;

ALTER TABLE vendor_reviews
  ALTER COLUMN booking_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_reviews_ticket_unique_idx
  ON vendor_reviews (ticket_id)
  WHERE ticket_id IS NOT NULL;

ALTER TABLE vendor_reviews
  DROP CONSTRAINT IF EXISTS vendor_reviews_source_check;

ALTER TABLE vendor_reviews
  ADD CONSTRAINT vendor_reviews_source_check CHECK (
    (booking_id IS NOT NULL AND ticket_id IS NULL)
    OR (booking_id IS NULL AND ticket_id IS NOT NULL)
  );

COMMIT;
