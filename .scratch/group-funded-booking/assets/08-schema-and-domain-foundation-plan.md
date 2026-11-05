# Schema and Domain Foundation Plan

This is the implementation-facing plan for ticket `08`. It defines the first migration/repository slice for group-funded booking while preserving existing booking, payment proof, notification, and queue behavior.

## Migration

Create one migration:

`database/migrations/20260712_add_group_funded_bookings.sql`

Mirror the final schema into `database/init.sql` after the migration is stable.

## `location_services` Extensions

Add nullable/defaulted group-funded settings to the existing branch-service table:

```sql
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
```

Add a cross-field check in `init.sql`; in the migration, use a named `DO $$` block so it is safe to re-run:

```sql
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
)
```

Add:

```sql
CREATE INDEX IF NOT EXISTS location_services_group_funded_enabled_idx
  ON location_services (tenant_id, location_id, service_id)
  WHERE group_funded_enabled = TRUE AND is_active = TRUE;
```

## `group_funded_bookings`

Parent campaign table:

```sql
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
```

Indexes:

```sql
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
```

## Participants

```sql
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
```

## Contributions

```sql
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
```

## Refunds

```sql
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
```

## Events

```sql
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
```

Event types should be constants in `backend/src/repositories/groupFundedBookings.js` or a small local helper, not scattered string literals.

Initial event vocabulary:

- `campaign_created`
- `campaign_visibility_changed`
- `description_updated`
- `organizer_canceled`
- `contribution_created`
- `contribution_submitted`
- `contribution_verified`
- `contribution_rejected`
- `funding_completed`
- `funding_deadline_expired`
- `capacity_hold_created`
- `capacity_hold_expired`
- `replacement_slot_proposed`
- `replacement_slot_accepted`
- `replacement_slot_declined`
- `vendor_approved`
- `vendor_rejected`
- `linked_booking_created`
- `refund_obligation_created`
- `refund_marked_in_progress`
- `refund_marked_completed`
- `policy_review_required`

## Capacity Holds

```sql
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
```

Ticket `10` must decide exactly how active holds are counted with existing booking capacity logic. Ticket `08` only creates the storage boundary.

## Normal Booking Link

Add nullable link/source fields to `bookings`:

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_funded_booking_id BIGINT REFERENCES group_funded_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_payment_source TEXT NOT NULL DEFAULT 'standard' CHECK (
    booking_payment_source IN ('standard', 'group_funded')
  );

CREATE INDEX IF NOT EXISTS bookings_group_funded_booking_idx
  ON bookings (group_funded_booking_id)
  WHERE group_funded_booking_id IS NOT NULL;
```

When a group-funded campaign is approved later, the normal booking should use `payment_status = 'paid'`, `booking_payment_source = 'group_funded'`, and `group_funded_booking_id = <campaign id>`. It should not copy contribution proof metadata into `bookings.payment_proof_*`.

## Backend Modules

Add:

- `backend/src/repositories/groupFundedBookings.js`
- `backend/tests/groupFundedBookingsRepository.test.cjs`

Update:

- `backend/src/repositories/locationServices.js`
- `backend/src/routes/vendorRouteHelpers.js`
- `backend/tests/vendorRouteHelpers.test.cjs`
- `backend/tests/vendorServiceHandlers.test.cjs`
- `backend/tests/bookingsRepository.test.cjs` only if the booking mapper exposes new nullable fields.

Do not add routes or service orchestration in `08`.

## Mapper Shape

`locationServices.mapLocationService(row)` should add:

```js
groupFunded: {
  enabled: Boolean(row.group_funded_enabled),
  minRequiredContributors: row.group_funded_min_required_contributors === null ? null : Number(row.group_funded_min_required_contributors),
  maxRequiredContributors: row.group_funded_max_required_contributors === null ? null : Number(row.group_funded_max_required_contributors),
  defaultRequiredContributors: row.group_funded_default_required_contributors === null ? null : Number(row.group_funded_default_required_contributors),
  minContributionAmountCents: row.group_funded_min_contribution_amount_cents === null ? null : Number(row.group_funded_min_contribution_amount_cents),
  maxContributionAmountCents: row.group_funded_max_contribution_amount_cents === null ? null : Number(row.group_funded_max_contribution_amount_cents),
  minDeadlineHours: row.group_funded_min_deadline_hours === null ? null : Number(row.group_funded_min_deadline_hours),
  maxDeadlineDays: row.group_funded_max_deadline_days === null ? null : Number(row.group_funded_max_deadline_days),
  allowPublicCampaigns: Boolean(row.group_funded_allow_public_campaigns)
}
```

Campaign repository mapper should use camelCase fields and preserve `metadata` / snapshots as plain objects.

## Tests

Add focused mocked-DB tests:

1. `locationServices` maps group-funded settings and upserts them without dropping existing capacity/price fields.
2. `normalizeLocationServicesPayload` validates enabled settings:
   - min/default/max contributor ordering.
   - deadline min/max ordering.
   - min/max contribution ordering when both are present.
3. `groupFundedBookings.createCampaign` inserts a campaign without inserting a normal booking.
4. `groupFundedBookings.createContribution` stores proof metadata on contribution rows.
5. `groupFundedBookings.createRefund` links refund records to contributions.
6. `groupFundedBookings.recordEvent` writes event metadata as JSONB.
7. Booking mapper test confirms the nullable group-funded link/source fields default safely and do not require campaign fixtures.

## Deferred Decisions

These are intentionally left to later tickets:

- Payment-proof object storage path for group-funded contributions.
- Route names and request/response payloads.
- How active group-funded capacity holds are counted in slot availability.
- Public campaign moderation implementation.
- Vendor replacement-slot command shape.
