#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null 2>&1 || {
  echo "psql is required but not installed or not on PATH." >&2
  exit 1
}

: "${DATABASE_URL:?DATABASE_URL must be set}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
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
SQL

echo "Schema verification passed."
