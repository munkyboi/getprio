ALTER TABLE group_funded_bookings
  ADD COLUMN IF NOT EXISTS campaign_title TEXT NOT NULL DEFAULT '';

ALTER TABLE group_funded_bookings
  DROP CONSTRAINT IF EXISTS group_funded_bookings_campaign_title_length_check;

ALTER TABLE group_funded_bookings
  ADD CONSTRAINT group_funded_bookings_campaign_title_length_check
  CHECK (char_length(campaign_title) <= 90);
