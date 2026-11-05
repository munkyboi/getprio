BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS developer_project_id UUID REFERENCES developer_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS developer_environment TEXT,
  ADD COLUMN IF NOT EXISTS external_reference TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_developer_environment_check'
      AND conrelid = 'tickets'::regclass
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_developer_environment_check
      CHECK (developer_environment IN ('sandbox', 'production') OR developer_environment IS NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_developer_external_reference_idx
  ON tickets (developer_project_id, developer_environment, external_reference)
  WHERE external_reference IS NOT NULL;

COMMIT;
