BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS check_in_window_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_closing_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS bookings_check_in_window_notify_idx
  ON bookings (scheduled_start_at)
  WHERE status IN ('confirmed', 'rescheduled')
    AND queue_ticket_id IS NULL
    AND check_in_window_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS bookings_check_in_closing_notify_idx
  ON bookings (scheduled_start_at)
  WHERE status IN ('confirmed', 'rescheduled')
    AND queue_ticket_id IS NULL
    AND check_in_closing_notified_at IS NULL;

COMMIT;
