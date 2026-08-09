BEGIN;

ALTER TABLE queue_events
  ADD COLUMN IF NOT EXISTS queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_key TEXT,
  ADD COLUMN IF NOT EXISTS correlation_key TEXT,
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS deadline_version INTEGER,
  ADD COLUMN IF NOT EXISTS previous_state JSONB,
  ADD COLUMN IF NOT EXISTS next_state JSONB,
  ADD COLUMN IF NOT EXISTS staff_note TEXT;

UPDATE queue_events
SET event_key = 'legacy:queue-event:' || id
WHERE event_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS queue_events_event_key_idx
  ON queue_events (event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_events_queue_day_created_idx
  ON queue_events (queue_day_id, created_at)
  WHERE queue_day_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS queue_notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  queue_event_id BIGINT REFERENCES queue_events(id) ON DELETE SET NULL,
  queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web_push', 'email')),
  template_name TEXT NOT NULL,
  payload_version INTEGER NOT NULL DEFAULT 1 CHECK (payload_version > 0),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  aggregate_version INTEGER,
  deadline_version INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'dead', 'obsolete')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_owner TEXT,
  leased_until TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS queue_notification_outbox_dispatch_idx
  ON queue_notification_outbox (available_at, id)
  WHERE status IN ('pending', 'retry');

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS outbox_id BIGINT REFERENCES queue_notification_outbox(id) ON DELETE SET NULL;

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
  CHECK (channel IN ('email', 'sms', 'web_push'));

COMMIT;
