ALTER TABLE group_funded_bookings
  DROP CONSTRAINT IF EXISTS group_funded_bookings_description_check;

ALTER TABLE group_funded_bookings
  ADD CONSTRAINT group_funded_bookings_description_check
  CHECK (char_length(description) <= 1000);
