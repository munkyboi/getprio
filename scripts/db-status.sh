#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null 2>&1 || {
  echo "psql is required but not installed or not on PATH." >&2
  exit 1
}

: "${DATABASE_URL:?DATABASE_URL must be set}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="$repo_root/database/migrations"
repo_migration_count="$(find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"

if ! psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.schema_migrations')" | grep -qx 'schema_migrations'; then
  echo "Migration status:"
  echo "  repo files: $repo_migration_count"
  echo "  applied: 0"
  echo "  pending: $repo_migration_count"
  echo "  missing from repo: 0"
  echo "schema_migrations table is missing. This database is not initialized yet; run npm run db:bootstrap for a brand new database."
  exit 0
fi

mapfile -t repo_migrations < <(find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' -print | sort | while IFS= read -r file; do basename "$file"; done)
mapfile -t applied_migrations < <(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT filename FROM schema_migrations ORDER BY filename")

pending_migrations=()
for migration in "${repo_migrations[@]}"; do
  if ! printf '%s\n' "${applied_migrations[@]:-}" | grep -Fxq "$migration"; then
    pending_migrations+=("$migration")
  fi
done

missing_migrations=()
for migration in "${applied_migrations[@]:-}"; do
  if ! printf '%s\n' "${repo_migrations[@]:-}" | grep -Fxq "$migration"; then
    missing_migrations+=("$migration")
  fi
done

echo "Migration status:"
echo "  repo files: ${#repo_migrations[@]}"
echo "  applied: ${#applied_migrations[@]}"
echo "  pending: ${#pending_migrations[@]}"
echo "  missing from repo: ${#missing_migrations[@]}"

if ((${#pending_migrations[@]} > 0)); then
  echo "Pending migrations:"
  printf '  - %s\n' "${pending_migrations[@]}"
fi

if ((${#missing_migrations[@]} > 0)); then
  echo "Applied migrations not present in the repo:"
  printf '  - %s\n' "${missing_migrations[@]}"
fi

if ((${#pending_migrations[@]} > 0 || ${#missing_migrations[@]} > 0)); then
  exit 1
fi

echo "Database migration status is clean."
