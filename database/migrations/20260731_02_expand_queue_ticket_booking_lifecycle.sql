BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS original_queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS pending_carry_over_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carry_over_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carry_over_consumed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_for_ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'tickets'::regclass
      AND contype = 'c'
      AND conkey @> ARRAY[(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'tickets'::regclass AND attname = 'status'
      )]::SMALLINT[]
  LOOP
    EXECUTE format('ALTER TABLE tickets DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'waiting', 'pending_carry_over', 'called', 'served',
    'skipped', 'cancelled', 'unserved', 'expired'
  ));

CREATE TABLE IF NOT EXISTS queue_ticket_segments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  queue_day_id BIGINT NOT NULL REFERENCES queue_days(id) ON DELETE CASCADE,
  display_number TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  priority_band TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority_band IN ('carry_over', 'recovery', 'checked_in_booking', 'normal')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  segment_outcome TEXT,
  outcome_reason TEXT,
  legacy_inferred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id, queue_day_id),
  UNIQUE (queue_day_id, sequence)
);

CREATE INDEX IF NOT EXISTS tickets_current_queue_day_status_idx
  ON tickets (current_queue_day_id, status, sequence);

CREATE INDEX IF NOT EXISTS tickets_pending_carry_over_due_idx
  ON tickets (carry_over_expires_at, id)
  WHERE status = 'pending_carry_over';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS fulfillment_outcome_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fulfillment_resolved_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND conkey @> ARRAY[(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'bookings'::regclass AND attname = 'status'
      )]::SMALLINT[]
  LOOP
    EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending', 'confirmed', 'rescheduled', 'completed', 'canceled',
    'disputed', 'reviewed', 'unfulfilled', 'missed'
  ));

COMMIT;
