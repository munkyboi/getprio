BEGIN;

ALTER TABLE bookings
  ADD COLUMN reminder_schedule_revision BIGINT NOT NULL DEFAULT 1 CHECK (reminder_schedule_revision > 0),
  ADD COLUMN reminder_eligible_at TIMESTAMPTZ DEFAULT clock_timestamp();

CREATE OR REPLACE FUNCTION maintain_booking_reminder_schedule() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reminder_schedule_revision := 1;
    NEW.reminder_eligible_at := CASE WHEN NEW.status IN ('confirmed','rescheduled') AND NEW.payment_status IN ('unpaid','paid') THEN clock_timestamp() ELSE NULL END;
  ELSE
    NEW.reminder_schedule_revision := OLD.reminder_schedule_revision;
    NEW.reminder_eligible_at := OLD.reminder_eligible_at;
    IF NEW.scheduled_start_at IS DISTINCT FROM OLD.scheduled_start_at
       OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.location_id IS DISTINCT FROM OLD.location_id
       OR (NEW.payment_status IN ('unpaid','paid') AND OLD.payment_status NOT IN ('unpaid','paid'))
       OR (NEW.status IN ('confirmed','rescheduled') AND OLD.status NOT IN ('confirmed','rescheduled')) THEN
      NEW.reminder_schedule_revision := OLD.reminder_schedule_revision + 1;
      NEW.reminder_eligible_at := CASE WHEN NEW.status IN ('confirmed','rescheduled') AND NEW.payment_status IN ('unpaid','paid') THEN clock_timestamp() ELSE NULL END;
    ELSIF NEW.status NOT IN ('confirmed','rescheduled') OR NEW.payment_status NOT IN ('unpaid','paid') THEN
      NEW.reminder_eligible_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_reminder_schedule_identity BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION maintain_booking_reminder_schedule();

ALTER TABLE queue_notification_outbox
  ADD COLUMN booking_id BIGINT REFERENCES bookings(id) ON DELETE CASCADE,
  ADD COLUMN booking_schedule_revision BIGINT,
  ADD COLUMN booking_reminder_stage TEXT,
  ADD CONSTRAINT booking_reminder_outbox_metadata CHECK (
    (booking_id IS NULL AND booking_schedule_revision IS NULL AND booking_reminder_stage IS NULL)
    OR (booking_id IS NOT NULL AND booking_schedule_revision IS NOT NULL AND booking_reminder_stage IS NOT NULL
      AND booking_schedule_revision > 0 AND booking_reminder_stage IN ('24h','1h')
      AND channel = 'fcm' AND template_name = 'booking_reminder_' || booking_reminder_stage)
  );
CREATE INDEX booking_reminder_due_idx ON bookings(scheduled_start_at)
  WHERE status IN ('confirmed','rescheduled') AND checked_in_at IS NULL AND queue_ticket_id IS NULL;
CREATE INDEX booking_reminder_outbox_idx ON queue_notification_outbox(booking_id,booking_schedule_revision)
  WHERE booking_id IS NOT NULL;

COMMIT;
