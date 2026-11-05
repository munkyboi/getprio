BEGIN;

ALTER TABLE account_deletion_tasks
  ADD COLUMN IF NOT EXISTS automation_report JSONB;

INSERT INTO account_deletion_tasks (request_id, kind)
SELECT DISTINCT request_id, 'application_relational_inventory'
FROM account_deletion_tasks
WHERE kind='personal_data_inventory'
ON CONFLICT (request_id, kind) DO NOTHING;

COMMIT;
