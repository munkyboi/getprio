BEGIN;

ALTER TABLE location_services
  ADD COLUMN IF NOT EXISTS group_funded_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS group_funded_min_required_contributors INTEGER CHECK (
    group_funded_min_required_contributors IS NULL
    OR group_funded_min_required_contributors BETWEEN 2 AND 100
  ),
  ADD COLUMN IF NOT EXISTS group_funded_max_required_contributors INTEGER CHECK (
    group_funded_max_required_contributors IS NULL
    OR group_funded_max_required_contributors BETWEEN 2 AND 100
  ),
  ADD COLUMN IF NOT EXISTS group_funded_default_required_contributors INTEGER CHECK (
    group_funded_default_required_contributors IS NULL
    OR group_funded_default_required_contributors BETWEEN 2 AND 100
  ),
  ADD COLUMN IF NOT EXISTS group_funded_min_contribution_amount_cents INTEGER CHECK (
    group_funded_min_contribution_amount_cents IS NULL
    OR group_funded_min_contribution_amount_cents >= 0
  ),
  ADD COLUMN IF NOT EXISTS group_funded_max_contribution_amount_cents INTEGER CHECK (
    group_funded_max_contribution_amount_cents IS NULL
    OR group_funded_max_contribution_amount_cents >= 0
  ),
  ADD COLUMN IF NOT EXISTS group_funded_min_deadline_hours INTEGER CHECK (
    group_funded_min_deadline_hours IS NULL
    OR group_funded_min_deadline_hours BETWEEN 1 AND 720
  ),
  ADD COLUMN IF NOT EXISTS group_funded_max_deadline_days INTEGER CHECK (
    group_funded_max_deadline_days IS NULL
    OR group_funded_max_deadline_days BETWEEN 1 AND 90
  ),
  ADD COLUMN IF NOT EXISTS group_funded_allow_public_campaigns BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_services_group_funded_settings_check'
  ) THEN
    ALTER TABLE location_services
      ADD CONSTRAINT location_services_group_funded_settings_check
      CHECK (
        NOT group_funded_enabled
        OR (
          group_funded_min_required_contributors IS NOT NULL
          AND group_funded_max_required_contributors IS NOT NULL
          AND group_funded_default_required_contributors IS NOT NULL
          AND group_funded_min_deadline_hours IS NOT NULL
          AND group_funded_max_deadline_days IS NOT NULL
          AND group_funded_min_required_contributors <= group_funded_default_required_contributors
          AND group_funded_default_required_contributors <= group_funded_max_required_contributors
          AND group_funded_min_deadline_hours <= group_funded_max_deadline_days * 24
          AND (
            group_funded_min_contribution_amount_cents IS NULL
            OR group_funded_max_contribution_amount_cents IS NULL
            OR group_funded_min_contribution_amount_cents <= group_funded_max_contribution_amount_cents
          )
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS location_services_group_funded_enabled_idx
  ON location_services (tenant_id, location_id, service_id)
  WHERE group_funded_enabled = TRUE AND is_active = TRUE;

CREATE TABLE IF NOT EXISTS group_funded_bookings (
  id BIGSERIAL PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  location_service_id BIGINT REFERENCES location_services(id) ON DELETE SET NULL,
  organizer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  linked_booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  campaign_status TEXT NOT NULL DEFAULT 'funding' CHECK (
    campaign_status IN (
      'draft',
      'funding',
      'organizer_canceled',
      'funding_failed',
      'funded',
      'slot_recovery',
      'vendor_review',
      'replacement_proposed',
      'vendor_approved',
      'vendor_rejected',
      'vendor_review_expired',
      'confirmed',
      'vendor_canceled',
      'policy_review_required'
    )
  ),
  visibility TEXT NOT NULL DEFAULT 'private_link' CHECK (
    visibility IN ('private_link', 'public')
  ),
  organizer_display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 280),
  service_name_snapshot TEXT NOT NULL,
  service_slug_snapshot TEXT NOT NULL,
  location_name_snapshot TEXT NOT NULL,
  location_slug_snapshot TEXT NOT NULL,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  funding_deadline_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  target_amount_cents INTEGER NOT NULL CHECK (target_amount_cents >= 0),
  required_contribution_amount_cents INTEGER NOT NULL CHECK (required_contribution_amount_cents >= 0),
  rounding_adjustment_cents INTEGER NOT NULL DEFAULT 0 CHECK (rounding_adjustment_cents >= 0),
  required_contributors INTEGER NOT NULL CHECK (required_contributors BETWEEN 2 AND 100),
  paid_participant_count INTEGER NOT NULL DEFAULT 0 CHECK (paid_participant_count >= 0),
  funded_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (funded_amount_cents >= 0),
  funded_at TIMESTAMPTZ,
  vendor_review_started_at TIMESTAMPTZ,
  vendor_review_expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at),
  CHECK (funding_deadline_at < scheduled_start_at),
  CHECK (paid_participant_count <= required_contributors)
);

CREATE INDEX IF NOT EXISTS group_funded_bookings_tenant_status_idx
  ON group_funded_bookings (tenant_id, location_id, campaign_status, created_at DESC);

CREATE INDEX IF NOT EXISTS group_funded_bookings_public_idx
  ON group_funded_bookings (tenant_id, location_id, funding_deadline_at)
  WHERE visibility = 'public'
    AND campaign_status IN ('funding', 'funded', 'vendor_review', 'replacement_proposed');

CREATE INDEX IF NOT EXISTS group_funded_bookings_organizer_idx
  ON group_funded_bookings (organizer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS group_funded_bookings_deadline_idx
  ON group_funded_bookings (funding_deadline_at)
  WHERE campaign_status = 'funding';

CREATE TABLE IF NOT EXISTS group_funded_booking_participants (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_role TEXT NOT NULL DEFAULT 'contributor' CHECK (
    participant_role IN ('organizer', 'contributor')
  ),
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_funded_participants_user_idx
  ON group_funded_booking_participants (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS group_funded_booking_contributions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  participant_id BIGINT NOT NULL REFERENCES group_funded_booking_participants(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  contribution_status TEXT NOT NULL DEFAULT 'pending_proof' CHECK (
    contribution_status IN (
      'pending_proof',
      'submitted',
      'verified',
      'rejected',
      'refund_pending',
      'refunded',
      'policy_review_required'
    )
  ),
  payment_reference TEXT,
  payment_proof_object_key TEXT,
  payment_proof_file_name TEXT,
  payment_proof_content_type TEXT,
  payment_proof_size_bytes INTEGER CHECK (
    payment_proof_size_bytes IS NULL OR payment_proof_size_bytes > 0
  ),
  payment_proof_uploaded_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  refund_status TEXT CHECK (
    refund_status IS NULL
    OR refund_status IN ('pending', 'in_progress', 'completed', 'rejected', 'policy_review_required')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_funded_contributions_campaign_status_idx
  ON group_funded_booking_contributions (campaign_id, contribution_status, created_at);

CREATE INDEX IF NOT EXISTS group_funded_contributions_user_idx
  ON group_funded_booking_contributions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS group_funded_contributions_proof_idx
  ON group_funded_booking_contributions (campaign_id, contribution_status, payment_proof_uploaded_at DESC)
  WHERE payment_proof_object_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_funded_booking_refunds (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  contribution_id BIGINT NOT NULL REFERENCES group_funded_booking_contributions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  refund_reason TEXT NOT NULL CHECK (
    refund_reason IN (
      'organizer_canceled',
      'funding_failed',
      'vendor_rejected',
      'vendor_review_expired',
      'vendor_canceled',
      'policy_review_required'
    )
  ),
  refund_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    refund_status IN ('pending', 'in_progress', 'completed', 'rejected', 'policy_review_required')
  ),
  vendor_actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  evidence_object_key TEXT,
  evidence_file_name TEXT,
  evidence_content_type TEXT,
  evidence_size_bytes INTEGER CHECK (
    evidence_size_bytes IS NULL OR evidence_size_bytes > 0
  ),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_funded_refunds_campaign_status_idx
  ON group_funded_booking_refunds (campaign_id, refund_status, created_at DESC);

CREATE INDEX IF NOT EXISTS group_funded_refunds_user_idx
  ON group_funded_booking_refunds (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_funded_booking_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_funded_events_campaign_idx
  ON group_funded_booking_events (campaign_id, created_at);

CREATE INDEX IF NOT EXISTS group_funded_events_tenant_idx
  ON group_funded_booking_events (tenant_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS group_funded_events_type_idx
  ON group_funded_booking_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS group_funded_capacity_holds (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE CASCADE,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  hold_status TEXT NOT NULL DEFAULT 'active' CHECK (
    hold_status IN ('active', 'released', 'expired', 'converted')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  converted_booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at)
);

CREATE INDEX IF NOT EXISTS group_funded_capacity_holds_active_idx
  ON group_funded_capacity_holds (tenant_id, location_id, service_id, scheduled_start_at, scheduled_end_at)
  WHERE hold_status = 'active';

CREATE INDEX IF NOT EXISTS group_funded_capacity_holds_expiry_idx
  ON group_funded_capacity_holds (expires_at)
  WHERE hold_status = 'active';

ALTER TABLE group_funded_bookings
  ADD COLUMN IF NOT EXISTS replacement_scheduled_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_scheduled_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_proposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_proposed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_funded_bookings_replacement_slot_check'
  ) THEN
    ALTER TABLE group_funded_bookings
      ADD CONSTRAINT group_funded_bookings_replacement_slot_check CHECK (
        replacement_scheduled_start_at IS NULL
        OR replacement_scheduled_end_at IS NULL
        OR replacement_scheduled_start_at < replacement_scheduled_end_at
      );
  END IF;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_funded_booking_id BIGINT REFERENCES group_funded_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_payment_source TEXT NOT NULL DEFAULT 'standard' CHECK (
    booking_payment_source IN ('standard', 'group_funded')
  );

CREATE INDEX IF NOT EXISTS bookings_group_funded_booking_idx
  ON bookings (group_funded_booking_id)
  WHERE group_funded_booking_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_location_services_updated_at ON location_services;
CREATE TRIGGER set_location_services_updated_at
BEFORE UPDATE ON location_services
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_group_funded_bookings_updated_at ON group_funded_bookings;
CREATE TRIGGER set_group_funded_bookings_updated_at
BEFORE UPDATE ON group_funded_bookings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_group_funded_booking_participants_updated_at ON group_funded_booking_participants;
CREATE TRIGGER set_group_funded_booking_participants_updated_at
BEFORE UPDATE ON group_funded_booking_participants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_group_funded_booking_contributions_updated_at ON group_funded_booking_contributions;
CREATE TRIGGER set_group_funded_booking_contributions_updated_at
BEFORE UPDATE ON group_funded_booking_contributions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_group_funded_booking_refunds_updated_at ON group_funded_booking_refunds;
CREATE TRIGGER set_group_funded_booking_refunds_updated_at
BEFORE UPDATE ON group_funded_booking_refunds
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_group_funded_capacity_holds_updated_at ON group_funded_capacity_holds;
CREATE TRIGGER set_group_funded_capacity_holds_updated_at
BEFORE UPDATE ON group_funded_capacity_holds
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
