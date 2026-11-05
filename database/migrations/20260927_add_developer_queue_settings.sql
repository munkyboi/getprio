ALTER TABLE developer_api_queues
  ADD COLUMN IF NOT EXISTS queue_prefix VARCHAR(4),
  ADD COLUMN IF NOT EXISTS average_service_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS notification_threshold INTEGER;

UPDATE developer_api_queues
   SET queue_prefix = UPPER(SUBSTRING(REGEXP_REPLACE(slug, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4))
 WHERE queue_prefix IS NULL;

UPDATE developer_api_queues
   SET average_service_minutes = 15
 WHERE average_service_minutes IS NULL;

UPDATE developer_api_queues
   SET notification_threshold = 2
 WHERE notification_threshold IS NULL;

ALTER TABLE developer_api_queues
  ALTER COLUMN queue_prefix SET DEFAULT 'MAIN',
  ALTER COLUMN queue_prefix SET NOT NULL,
  ALTER COLUMN average_service_minutes SET DEFAULT 15,
  ALTER COLUMN average_service_minutes SET NOT NULL,
  ALTER COLUMN notification_threshold SET DEFAULT 2,
  ALTER COLUMN notification_threshold SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'developer_api_queues'::regclass
       AND conname = 'developer_api_queues_queue_prefix_check'
  ) THEN
    ALTER TABLE developer_api_queues
      ADD CONSTRAINT developer_api_queues_queue_prefix_check
      CHECK (queue_prefix ~ '^[A-Z0-9]{1,4}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'developer_api_queues'::regclass
       AND conname = 'developer_api_queues_average_service_minutes_check'
  ) THEN
    ALTER TABLE developer_api_queues
      ADD CONSTRAINT developer_api_queues_average_service_minutes_check
      CHECK (average_service_minutes BETWEEN 1 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'developer_api_queues'::regclass
       AND conname = 'developer_api_queues_notification_threshold_check'
  ) THEN
    ALTER TABLE developer_api_queues
      ADD CONSTRAINT developer_api_queues_notification_threshold_check
      CHECK (notification_threshold BETWEEN 1 AND 10);
  END IF;
END $$;

ALTER TABLE developer_api_tickets
  ADD COLUMN IF NOT EXISTS near_turn_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS near_turn_notification_claimed_at TIMESTAMPTZ;
