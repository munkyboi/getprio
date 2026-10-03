-- Existing branches retain staff-managed arrival until an admin opts in.
ALTER TABLE store_locations
  ADD COLUMN IF NOT EXISTS customer_self_check_in_enabled BOOLEAN NOT NULL DEFAULT FALSE;
