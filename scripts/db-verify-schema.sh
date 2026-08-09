#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

run_psql() {
  if command -v docker >/dev/null 2>&1 &&
    [[ -n "$(docker compose ps --status running -q database 2>/dev/null)" ]]; then
    local docker_database_url
    docker_database_url="${DATABASE_URL/127.0.0.1/host.docker.internal}"
    docker_database_url="${docker_database_url/localhost/host.docker.internal}"
    docker compose exec -T database psql "$docker_database_url" "$@"
    return
  fi
  if [[ -x /usr/bin/psql ]]; then
    /usr/bin/psql "$DATABASE_URL" "$@"
    return
  fi
  if command -v psql >/dev/null 2>&1; then
    psql_path="$(command -v psql)"
    if [[ "$psql_path" != *"/node_modules/"* ]]; then
      psql "$DATABASE_URL" "$@"
      return
    fi
  fi
  echo "psql is required but not installed or not on PATH, and docker compose database is unavailable." >&2
  exit 1
}

run_psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  missing_columns text[];
BEGIN
  SELECT array_agg(required_column)
  INTO missing_columns
  FROM (
    SELECT 'users.roles' AS required_column
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'roles'
    )
    UNION ALL
    SELECT 'tickets.location_id'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'location_id'
    )
    UNION ALL
    SELECT 'tickets.queue_date_key'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'queue_date_key'
    )
    UNION ALL
    SELECT 'tickets.service_priority_band'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'service_priority_band'
    )
    UNION ALL
    SELECT 'queue_day_closures.closed_at'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'queue_day_closures' AND column_name = 'closed_at'
    )
    UNION ALL
    SELECT 'queue_day_closures.reopened_at'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'queue_day_closures' AND column_name = 'reopened_at'
    )
    UNION ALL
    SELECT 'bookings.payment_proof_object_key'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'payment_proof_object_key'
    )
    UNION ALL
    SELECT 'bookings.pending_expires_at'
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'pending_expires_at'
    )
    UNION ALL
    SELECT 'store_locations.queue_lifecycle_mode'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_locations'
        AND column_name = 'queue_lifecycle_mode'
    )
    UNION ALL
    SELECT 'tickets.current_queue_day_id'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tickets'
        AND column_name = 'current_queue_day_id'
    )
    UNION ALL
    SELECT 'bookings.fulfillment_outcome_reason'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookings'
        AND column_name = 'fulfillment_outcome_reason'
    )
    UNION ALL
    SELECT 'queue_events.event_key'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'queue_events'
        AND column_name = 'event_key'
    )
    UNION ALL
    SELECT 'tickets.email_journey_mode'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='email_journey_mode')
    UNION ALL
    SELECT 'tickets.customer_confirmed_at'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='customer_confirmed_at')
    UNION ALL
    SELECT 'queue_join_otps.chain_id'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='queue_join_otps' AND column_name='chain_id')
  ) required_columns;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Schema verification failed. Missing columns: %', array_to_string(missing_columns, ', ');
  END IF;
END $$;

DO $$
DECLARE
  missing_tables text[];
BEGIN
  SELECT array_agg(table_name)
  INTO missing_tables
  FROM (VALUES
    ('queue_days'),
    ('queue_day_extensions'),
    ('queue_ticket_segments'),
    ('queue_notification_outbox'),
    ('tenant_membership_locations'),
    ('queue_lifecycle_backfill_runs'),
    ('queue_lifecycle_migration_anomalies'),
    ('auth_mfa_factors'),
    ('auth_mfa_challenges'),
    ('auth_mfa_recovery_codes'),
    ('privileged_transaction_confirmations'),
    ('idempotency_records'),
    ('security_audit_events'),
    ('security_rate_limit_buckets'),
    ('plan_feature_entitlements'),
    ('plan_allowances'),
    ('plan_policy_baselines'),
    ('tenant_entitlement_overrides'),
    ('subscription_transitions'),
    ('usage_accounts'),
    ('subscription_allowance_periods'),
    ('allowance_operations'),
    ('allowance_allocations'),
    ('allowance_reservations'),
    ('allowance_reservation_allocations'),
    ('allowance_reconciliation_records'),
    ('usage_credit_packs'),
    ('usage_credit_pack_revisions'),
    ('usage_credit_purchases'),
    ('usage_credit_lots'),
    ('usage_credit_refunds'),
    ('usage_credit_disputes'),
    ('queue_email_journeys'),
    ('queue_email_slots'),
    ('entitlement_rollout_runs'),
    ('entitlement_rollout_anomalies')
  ) required(table_name)
  WHERE to_regclass('public.' || table_name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Schema verification failed. Missing Queue Day tables: %',
      array_to_string(missing_tables, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'queue_events_event_key_idx'
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Missing queue event idempotency index.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tickets
    WHERE status NOT IN (
      'waiting', 'pending_carry_over', 'called', 'served',
      'skipped', 'cancelled', 'unserved', 'expired'
    )
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Unsupported ticket lifecycle status found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'tickets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pending_carry_over%'
      AND pg_get_constraintdef(oid) LIKE '%expired%'
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Ticket lifecycle status constraint is stale.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%unfulfilled%'
      AND pg_get_constraintdef(oid) LIKE '%missed%'
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Booking outcome status constraint is stale.';
  END IF;
END $$;

DO $$
DECLARE
  missing_constraints text[];
  mismatched_bundle_count bigint;
BEGIN
  IF to_regclass('public.booking_bundle_items') IS NULL THEN
    RAISE EXCEPTION 'Schema verification failed. Missing table: booking_bundle_items';
  END IF;

  SELECT array_agg(required_constraint)
  INTO missing_constraints
  FROM (
    SELECT required_constraint
    FROM (VALUES
      ('booking_bundle_items_booking_scope_fkey', 'FOREIGN KEY (booking_id, tenant_id, location_id) REFERENCES bookings(id, tenant_id, location_id) ON DELETE CASCADE'),
      ('booking_bundle_items_location_scope_fkey', 'FOREIGN KEY (location_id, tenant_id) REFERENCES store_locations(id, tenant_id) ON DELETE CASCADE'),
      ('booking_bundle_items_service_scope_fkey', 'FOREIGN KEY (service_id, tenant_id) REFERENCES vendor_services(id, tenant_id) ON DELETE RESTRICT')
    ) AS required(required_constraint, required_definition)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.booking_bundle_items'::regclass
        AND conname = required.required_constraint
        AND pg_get_constraintdef(oid) = required.required_definition
    )
  ) missing;

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'Schema verification failed. Missing constraints: %', array_to_string(missing_constraints, ', ');
  END IF;

  SELECT COUNT(*)
  INTO mismatched_bundle_count
  FROM booking_bundle_items AS bundle_item
  WHERE NOT EXISTS (
    SELECT 1
    FROM bookings AS booking
    INNER JOIN store_locations AS location
      ON location.id = bundle_item.location_id
     AND location.tenant_id = bundle_item.tenant_id
    INNER JOIN vendor_services AS service
      ON service.id = bundle_item.service_id
     AND service.tenant_id = bundle_item.tenant_id
    WHERE booking.id = bundle_item.booking_id
      AND booking.tenant_id = bundle_item.tenant_id
      AND booking.location_id = bundle_item.location_id
  );

  IF mismatched_bundle_count > 0 THEN
    RAISE EXCEPTION 'Schema verification failed. Found % cross-boundary booking bundle rows.', mismatched_bundle_count;
  END IF;
END $$;

DO $$
DECLARE
  plan_count integer;
BEGIN
  SELECT COUNT(*) INTO plan_count
  FROM subscription_plans
  WHERE slug IN ('free', 'economical', 'pro', 'enterprise');
  IF plan_count <> 4 THEN
    RAISE EXCEPTION 'Schema verification failed. Expected all four subscription plans.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscription_plans
    WHERE (slug = 'free' AND (monthly_amount_cents <> 0 OR annual_amount_cents <> 0 OR checkout_enabled))
       OR (slug = 'economical' AND (monthly_amount_cents <> 49900 OR annual_amount_cents <> 498000))
       OR (slug = 'pro' AND (monthly_amount_cents <> 149900 OR annual_amount_cents <> 1499000))
       OR (slug = 'enterprise' AND (monthly_amount_cents <> 699900 OR annual_amount_cents <> 6999000))
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Subscription price invariants changed.';
  END IF;

  IF (SELECT COUNT(*) FROM queue_fee_settings WHERE plan_slug IN ('free','economical','pro','enterprise')) <> 4 THEN
    RAISE EXCEPTION 'Schema verification failed. Queue fee settings do not cover all plans.';
  END IF;

  IF EXISTS (SELECT 1 FROM billing_checkout_sessions WHERE plan_slug = 'free') THEN
    RAISE EXCEPTION 'Schema verification failed. Free cannot have a subscription checkout.';
  END IF;

  IF EXISTS (
    SELECT required.table_name
    FROM (VALUES
      ('plan_feature_entitlements'), ('plan_allowances'), ('plan_policy_baselines'),
      ('tenant_entitlement_overrides'), ('subscription_transitions'),
      ('entitlement_rollout_runs'), ('entitlement_rollout_anomalies'),
      ('auth_mfa_factors'), ('auth_mfa_challenges'),
      ('privileged_transaction_confirmations'),
      ('usage_accounts'), ('subscription_allowance_periods'), ('allowance_operations'),
      ('allowance_allocations'), ('allowance_reservations'), ('allowance_warning_claims'),
      ('allowance_reconciliation_records'), ('queue_email_journeys'), ('queue_email_slots'),
      ('usage_credit_packs'), ('usage_credit_pack_revisions'), ('usage_credit_purchases'),
      ('usage_credit_lots'), ('usage_credit_refunds'), ('usage_credit_disputes')
    ) AS required(table_name)
    WHERE to_regclass('public.' || required.table_name) IS NULL
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Entitlement or security foundation tables are missing.';
  END IF;

  IF EXISTS (
    SELECT required.column_name
    FROM (VALUES
      ('tenant_subscriptions', 'entitlement_model_version'),
      ('tenant_subscriptions', 'entitlement_comparison_hash'),
      ('tenant_subscriptions', 'entitlement_converted_at'),
      ('entitlement_rollout_anomalies', 'blocking')
    ) AS required(table_name, column_name)
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
     AND actual.table_name = required.table_name
     AND actual.column_name = required.column_name
    WHERE actual.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'Schema verification failed. Entitlement compatibility authority columns are missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('free','queueTickets',500),('free','queueEmailJourneys',500),('free','serviceBookings',0),
      ('economical','queueTickets',1000),('economical','queueEmailJourneys',1000),('economical','serviceBookings',100),
      ('pro','queueTickets',5000),('pro','queueEmailJourneys',5000),('pro','serviceBookings',1000),
      ('enterprise','queueTickets',50000),('enterprise','queueEmailJourneys',50000),('enterprise','serviceBookings',10000)
    ) expected(plan_slug, allowance_key, monthly_limit)
    LEFT JOIN plan_allowances actual USING (plan_slug, allowance_key)
    WHERE actual.monthly_limit IS DISTINCT FROM expected.monthly_limit
  ) THEN RAISE EXCEPTION 'Schema verification failed. Plan allowance ladder drifted.'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES ('P100',100,100,9900),('P500',500,500,39900),('P1000',1000,1000,69900)) expected(code,tickets,journeys,price)
    LEFT JOIN usage_credit_packs p ON p.code=expected.code
    LEFT JOIN usage_credit_pack_revisions r ON r.pack_id=p.id AND r.revision=p.current_revision
    WHERE r.ticket_units IS DISTINCT FROM expected.tickets OR r.journey_units IS DISTINCT FROM expected.journeys OR r.price_cents IS DISTINCT FROM expected.price
  ) THEN RAISE EXCEPTION 'Schema verification failed. Usage Credit catalog drifted.'; END IF;

  IF EXISTS (SELECT 1 FROM usage_credit_lots WHERE revoked_units + frozen_units > granted_units) THEN
    RAISE EXCEPTION 'Schema verification failed. Usage Credit lot has a negative available invariant.';
  END IF;
END $$;
SQL

echo "Schema verification passed."
