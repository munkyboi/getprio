BEGIN;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'queue_notification_outbox'::regclass
      AND contype = 'c'
      AND conkey @> ARRAY[(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'queue_notification_outbox'::regclass
          AND attname = 'channel'
      )]::SMALLINT[]
  LOOP
    EXECUTE format(
      'ALTER TABLE queue_notification_outbox DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END $$;

ALTER TABLE queue_notification_outbox
  ADD CONSTRAINT queue_notification_outbox_channel_check
  CHECK (channel IN ('email', 'web_push', 'fcm'));

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'notification_deliveries'::regclass
      AND contype = 'c'
      AND conkey @> ARRAY[(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'notification_deliveries'::regclass
          AND attname = 'channel'
      )]::SMALLINT[]
  LOOP
    EXECUTE format(
      'ALTER TABLE notification_deliveries DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END $$;

ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'web_push', 'fcm'));

CREATE TABLE IF NOT EXISTS mobile_push_outbox_deliveries (
  outbox_id BIGINT NOT NULL REFERENCES queue_notification_outbox(id) ON DELETE CASCADE,
  registration_id BIGINT NOT NULL REFERENCES mobile_push_registrations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'stale')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  lease_owner TEXT,
  leased_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (outbox_id, registration_id)
);

CREATE INDEX IF NOT EXISTS mobile_push_outbox_deliveries_pending_idx
  ON mobile_push_outbox_deliveries (outbox_id, status);

CREATE INDEX IF NOT EXISTS mobile_push_outbox_deliveries_registration_idx
  ON mobile_push_outbox_deliveries (registration_id);

CREATE OR REPLACE TRIGGER set_mobile_push_outbox_deliveries_updated_at
BEFORE UPDATE ON mobile_push_outbox_deliveries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
