BEGIN;

ALTER TABLE store_locations
  ALTER COLUMN queue_lifecycle_mode SET DEFAULT 'enforced';

UPDATE store_locations
SET queue_lifecycle_mode = 'enforced'
WHERE queue_lifecycle_mode IS DISTINCT FROM 'enforced';

COMMIT;
