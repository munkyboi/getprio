#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/db-apply.sh migrate
  scripts/db-apply.sh bootstrap

Commands:
  migrate   Apply all SQL files under database/migrations/ in filename order.
  bootstrap Rebuild from database/init.sql, then apply all migrations.

Environment:
  DATABASE_URL must be set.

Notes:
  - bootstrap is destructive because database/init.sql drops existing tables.
  - migrate is the correct command for existing databases and production upgrades.
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

command -v psql >/dev/null 2>&1 || {
  echo "psql is required but not installed or not on PATH." >&2
  exit 1
}

: "${DATABASE_URL:?DATABASE_URL must be set}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
init_sql="$repo_root/database/init.sql"
migrations_dir="$repo_root/database/migrations"
mode="$1"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

run_sql_file() {
  local file="$1"
  echo "Applying $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
}

case "$mode" in
  bootstrap)
    echo "Running destructive bootstrap from database/init.sql"
    run_sql_file "$init_sql"
    ;;
  migrate)
    ;;
  *)
    usage
    exit 1
    ;;
esac

applied_migrations="$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT filename FROM schema_migrations ORDER BY filename")"

while IFS= read -r file; do
  filename="$(basename "$file")"
  if printf '%s\n' "$applied_migrations" | grep -Fxq "$filename"; then
    echo "Skipping already applied $filename"
    continue
  fi

  run_sql_file "$file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v filename="$filename" <<'SQL'
INSERT INTO schema_migrations (filename)
VALUES (:'filename')
ON CONFLICT (filename) DO NOTHING;
SQL
done < <(find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' | sort)

echo "Database SQL apply complete."
