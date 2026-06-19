ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_resume_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_resume_vacancy_percent INTEGER;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_auto_resume_vacancy_percent_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_auto_resume_vacancy_percent_check
  CHECK (auto_resume_vacancy_percent IS NULL OR auto_resume_vacancy_percent BETWEEN 5 AND 50);
