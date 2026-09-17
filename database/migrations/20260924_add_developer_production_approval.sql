BEGIN;

CREATE TABLE IF NOT EXISTS developer_project_production_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL UNIQUE REFERENCES developer_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (status IN ('not_submitted', 'pending_review', 'changes_requested', 'approved', 'rejected', 'withdrawn')),
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_submission_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_project_production_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES developer_project_production_applications(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'changes_requested', 'approved', 'rejected', 'withdrawn')),
  submitted_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewer_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_feedback TEXT,
  UNIQUE (application_id, version)
);

ALTER TABLE developer_project_production_applications
  DROP CONSTRAINT IF EXISTS developer_project_production_applications_approved_submission_fk;

ALTER TABLE developer_project_production_applications
  ADD CONSTRAINT developer_project_production_applications_approved_submission_fk
  FOREIGN KEY (approved_submission_id)
  REFERENCES developer_project_production_submissions(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS developer_project_production_submissions_status_idx
  ON developer_project_production_submissions (application_id, status, version DESC);

COMMIT;
