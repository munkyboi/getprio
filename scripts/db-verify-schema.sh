#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

run_psql() {
  if command -v docker >/dev/null 2>&1 &&
    [[ -n "$(docker compose ps --status running -q database 2>/dev/null)" ]]; then
    docker compose exec -T database env DATABASE_URL="$DATABASE_URL" psql "$DATABASE_URL" "$@"
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
    ('queue_lifecycle_migration_anomalies')
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
SQL

echo "Schema verification passed."
