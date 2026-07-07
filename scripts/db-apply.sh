#!/usr/bin/env bash
set -euo pipefail

load_env_file() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  while IFS='=' read -r key value; do
    [[ -z "${key:-}" ]] && continue
    [[ "${key:0:1}" == "#" ]] && continue
    value="${value%$'\r'}"
    export "$key=$value"
  done < <(
    awk -F= '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*$/ { next }
      {
        key = $1
        sub(/[[:space:]]+$/, "", key)
        sub(/^[[:space:]]+/, "", key)
        sub(/^[[:space:]]+/, "", $0)
        sub(/^[^=]*=/, "", $0)
        print key "=" $0
      }
    ' "$env_file"
  )
}

database_has_user_tables() {
  local table_count
  table_count="$(run_psql -At -v ON_ERROR_STOP=1 -c "
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name NOT IN ('schema_migrations')
  " | tr -d '[:space:]')"

  [[ "${table_count:-0}" != "0" ]]
}

run_psql() {
  if command -v docker >/dev/null 2>&1 && docker compose ps database >/dev/null 2>&1; then
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
  - bootstrap is destructive and intended for a fresh install. It drops the schema,
    rebuilds it from database/init.sql, and then applies all migrations.
  - migrate is the correct command for existing databases and production upgrades.
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
init_sql="$repo_root/database/init.sql"
migrations_dir="$repo_root/database/migrations"
mode="$1"

load_env_file "$repo_root/.env"

: "${DATABASE_URL:?DATABASE_URL must be set}"

run_psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

run_sql_file() {
  local file="$1"
  echo "Applying $(basename "$file")"
  run_psql -v ON_ERROR_STOP=1 < "$file"
}

case "$mode" in
  bootstrap)
    if database_has_user_tables && [[ "${DB_BOOTSTRAP_FORCE:-0}" != "1" ]]; then
      echo "Warning: this database already has application tables."
      echo "This will drop and recreate the schema from database/init.sql."
      if [[ -t 0 ]]; then
        printf 'Type DELETE-AND-REBUILD to continue: '
        read -r confirmation
        if [[ "$confirmation" != "DELETE-AND-REBUILD" ]]; then
          echo "Bootstrap cancelled."
          exit 1
        fi
      else
        echo "Set DB_BOOTSTRAP_FORCE=1 to continue in non-interactive mode."
        exit 1
      fi
    fi
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

applied_migrations="$(run_psql -At -v ON_ERROR_STOP=1 -c "SELECT filename FROM schema_migrations ORDER BY filename")"

while IFS= read -r file; do
  filename="$(basename "$file")"
  if printf '%s\n' "$applied_migrations" | grep -Fxq "$filename"; then
    echo "Skipping already applied $filename"
    continue
  fi

  run_sql_file "$file"
  run_psql -v ON_ERROR_STOP=1 -v filename="$filename" <<'SQL'
INSERT INTO schema_migrations (filename)
VALUES (:'filename')
ON CONFLICT (filename) DO NOTHING;
SQL
done < <(find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' | sort)

echo "Database SQL apply complete."
