BEGIN;

-- These tables are deliberately separate from the retired vendor-managed
-- group_funded_* model. A campaign is an organizer's collection record that
-- is attached to an existing paid/validated booking; it never becomes a
-- booking or moves contribution money through GetPrio.
CREATE TABLE IF NOT EXISTS organizer_campaigns (
  id BIGSERIAL PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  organizer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  campaign_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    campaign_status IN ('draft', 'collecting', 'collected', 'refund_pending', 'cancelled', 'frozen')
  ),
  visibility TEXT NOT NULL DEFAULT 'private_link' CHECK (visibility IN ('private_link', 'public')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  deadline_at TIMESTAMPTZ NOT NULL,
  contribution_fee_cents INTEGER NOT NULL CHECK (contribution_fee_cents > 0),
  required_contributors INTEGER NOT NULL CHECK (required_contributors BETWEEN 1 AND 100),
  payment_instructions TEXT NOT NULL CHECK (char_length(payment_instructions) BETWEEN 1 AND 2000),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  frozen_at TIMESTAMPTZ,
  frozen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizer_campaigns_organizer_idx
  ON organizer_campaigns (organizer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organizer_campaigns_public_idx
  ON organizer_campaigns (deadline_at ASC, published_at DESC)
  WHERE visibility = 'public' AND campaign_status = 'collecting';
CREATE INDEX IF NOT EXISTS organizer_campaigns_deadline_idx
  ON organizer_campaigns (deadline_at ASC)
  WHERE campaign_status = 'collecting';

CREATE TABLE IF NOT EXISTS organizer_campaign_contributions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES organizer_campaigns(id) ON DELETE CASCADE,
  contributor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contribution_status TEXT NOT NULL DEFAULT 'pending_proof' CHECK (
    contribution_status IN ('pending_proof', 'submitted', 'accepted', 'rejected', 'refund_pending', 'refund_sent', 'refund_confirmed', 'refund_disputed')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_reference TEXT,
  payment_proof_object_key TEXT,
  payment_proof_file_name TEXT,
  payment_proof_content_type TEXT,
  payment_proof_size_bytes INTEGER CHECK (payment_proof_size_bytes IS NULL OR payment_proof_size_bytes > 0),
  submitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  resubmission_count INTEGER NOT NULL DEFAULT 0 CHECK (resubmission_count BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contributor_user_id)
);

CREATE INDEX IF NOT EXISTS organizer_campaign_contributions_campaign_idx
  ON organizer_campaign_contributions (campaign_id, contribution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS organizer_campaign_contributions_user_idx
  ON organizer_campaign_contributions (contributor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organizer_campaign_reimbursements (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES organizer_campaigns(id) ON DELETE CASCADE,
  contribution_id BIGINT NOT NULL UNIQUE REFERENCES organizer_campaign_contributions(id) ON DELETE CASCADE,
  contributor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reimbursement_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    reimbursement_status IN ('pending', 'sent', 'confirmed', 'disputed')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  evidence_object_key TEXT,
  evidence_file_name TEXT,
  evidence_content_type TEXT,
  evidence_size_bytes INTEGER CHECK (evidence_size_bytes IS NULL OR evidence_size_bytes > 0),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  dispute_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizer_campaign_reimbursements_campaign_idx
  ON organizer_campaign_reimbursements (campaign_id, reimbursement_status, created_at DESC);

CREATE TABLE IF NOT EXISTS organizer_campaign_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES organizer_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizer_campaign_events_campaign_idx
  ON organizer_campaign_events (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organizer_campaign_reports (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES organizer_campaigns(id) ON DELETE CASCADE,
  reporter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('misleading', 'prohibited_financial_activity', 'harassment', 'spam', 'other')),
  evidence_object_key TEXT,
  details TEXT CHECK (char_length(details) <= 1000),
  report_status TEXT NOT NULL DEFAULT 'open' CHECK (report_status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizer_campaign_reports_reporter_idx
  ON organizer_campaign_reports (reporter_user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_organizer_campaigns_updated_at ON organizer_campaigns;
CREATE TRIGGER set_organizer_campaigns_updated_at
BEFORE UPDATE ON organizer_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_organizer_campaign_contributions_updated_at ON organizer_campaign_contributions;
CREATE TRIGGER set_organizer_campaign_contributions_updated_at
BEFORE UPDATE ON organizer_campaign_contributions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_organizer_campaign_reimbursements_updated_at ON organizer_campaign_reimbursements;
CREATE TRIGGER set_organizer_campaign_reimbursements_updated_at
BEFORE UPDATE ON organizer_campaign_reimbursements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_organizer_campaign_reports_updated_at ON organizer_campaign_reports;
CREATE TRIGGER set_organizer_campaign_reports_updated_at
BEFORE UPDATE ON organizer_campaign_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
