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
    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
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

usage() {
  cat <<'EOF'
Usage:
  scripts/db-apply.sh migrate
  scripts/db-apply.sh migrate-free-tier
  scripts/db-apply.sh bootstrap

Commands:
  migrate   Apply all SQL files under database/migrations/ in filename order.
  migrate-free-tier Apply only the reviewed Free-tier/security migration manifest.
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
  migrate|migrate-free-tier)
    ;;
  *)
    usage
    exit 1
    ;;
esac

applied_migrations="$(run_psql -At -v ON_ERROR_STOP=1 -c "SELECT TRIM(filename) FROM schema_migrations ORDER BY TRIM(filename)")"

free_tier_migrations=(
  "20260804_01_harden_auth_sessions.sql"
  "20260804_02_add_mfa_and_privileged_confirmations.sql"
  "20260804_03_add_free_plan_and_live_policies.sql"
  "20260804_04_add_idempotency_and_security_audit.sql"
  "20260804_05_add_allowance_ledger.sql"
  "20260804_06_add_usage_credit_commerce.sql"
  "20260804_07_add_queue_otp_chains.sql"
  "20260809_01_finalize_free_tier_rollout.sql"
  "20260809_02_repair_free_plan_entitlement_shape.sql"
  "20260809_03_repair_mfa_replacement_indexes.sql"
)

queue_day_prerequisites=(
  "20260731_01_add_queue_day_lifecycle_foundation.sql"
  "20260731_02_expand_queue_ticket_booking_lifecycle.sql"
  "20260731_03_expand_queue_events_and_add_outbox.sql"
  "20260731_04_add_queue_location_assignments_and_payments.sql"
  "20260801_enforce_queue_lifecycle_mode.sql"
)

if [[ "$mode" == "migrate-free-tier" ]]; then
  for prerequisite in "${queue_day_prerequisites[@]}"; do
    if ! printf '%s\n' "$applied_migrations" | grep -Fxq "$prerequisite"; then
      echo "Free-tier migration refused: independently qualify and apply Queue Day prerequisite $prerequisite first." >&2
      exit 1
    fi
  done
fi

should_apply_file() {
  local filename="$1"
  if [[ "$mode" != "migrate-free-tier" ]]; then
    return 0
  fi
  printf '%s\n' "${free_tier_migrations[@]}" | grep -Fxq "$filename"
}

while IFS= read -r file; do
  filename="$(basename "$file")"
  if ! should_apply_file "$filename"; then
    continue
  fi
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
