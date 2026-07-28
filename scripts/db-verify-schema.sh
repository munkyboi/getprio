#!/usr/bin/env bash
set -euo pipefail

if [[ -x /usr/bin/psql ]]; then
  psql_bin="/usr/bin/psql"
elif command -v psql >/dev/null 2>&1; then
  psql_bin="$(command -v psql)"
  if [[ "$psql_bin" == *"/node_modules/"* ]]; then
    echo "psql is required but the only available binary is the broken node_modules/psql wrapper." >&2
    exit 1
  fi
else
  echo "psql is required but not installed or not on PATH." >&2
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL must be set}"

"$psql_bin" "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
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
  ) required_columns;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Schema verification failed. Missing columns: %', array_to_string(missing_columns, ', ');
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
