#!/bin/sh
# Invoked by the PostgreSQL image after init.sql, only for a fresh data volume.
# Keep migrations outside the entrypoint directory so they run through the ledger.
set -eu

for migration_file in /getprio-migrations/*.sql; do
  [ -f "$migration_file" ] || continue
  migration_name="${migration_file##*/}"
  migration_applied="$(psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 -v filename="$migration_name" -At <<'SQL'
SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = :'filename');
SQL
  )"
  [ "$migration_applied" != 't' ] || continue
  printf 'Applying %s\n' "$migration_name"
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 -f "$migration_file"
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 -v filename="$migration_name" <<'SQL'
INSERT INTO schema_migrations (filename) VALUES (:'filename') ON CONFLICT (filename) DO NOTHING;
SQL
done
