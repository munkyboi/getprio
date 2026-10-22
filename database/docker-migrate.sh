#!/bin/sh
# Invoked by the PostgreSQL image after init.sql, only for a fresh data volume.
# Keep migrations outside the entrypoint directory so they run through the ledger.
set -eu

migrations_dir="${GETPRIO_MIGRATIONS_DIR:-/getprio-migrations}"
manifest="$migrations_dir/migration-order.txt"
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ -f "$manifest" ] && [ ! -L "$manifest" ] && [ -s "$manifest" ] || fail 'A regular migration order manifest is required.'
# Validate the complete input before the first database command. The manifest is
# generated from the shared Node dependency planner and checked by CI.
awk '
  !/^[A-Za-z0-9_.-]+[.]sql$/ { exit 1 }
  seen[$0]++ { exit 1 }
' "$manifest" || fail 'Migration manifest contains an unsafe or duplicate filename.'
while IFS= read -r migration_name || [ -n "$migration_name" ]; do
  [ -f "$migrations_dir/$migration_name" ] && [ ! -L "$migrations_dir/$migration_name" ] || fail 'A migration listed in the manifest is missing or is not a regular file.'
done < "$manifest"
for migration_file in "$migrations_dir"/*.sql; do
  [ -e "$migration_file" ] || [ -L "$migration_file" ] || continue
  [ -f "$migration_file" ] && [ ! -L "$migration_file" ] || fail 'Migration inventory contains a non-regular SQL file.'
  migration_name="${migration_file##*/}"
  [ "$(grep -Fxc -e "$migration_name" "$manifest")" -eq 1 ] || fail 'Migration inventory and manifest differ.'
done

while IFS= read -r migration_name || [ -n "$migration_name" ]; do
  migration_file="$migrations_dir/$migration_name"
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
done < "$manifest"
