#!/bin/sh
# Disposable CI-only bootstrap verification: no host ports or existing volumes.
set -eu
repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/getprio-bootstrap-check.XXXXXX")"
identity="$(basename "$work_dir" | tr '.' '-')"
container="${identity}-pg"
volume="${identity}-data"
cleanup() {
  if [ "$(docker inspect -f '{{index .Config.Labels "getprio.bootstrap-owner"}}' "$container" 2>/dev/null || true)" = "$identity" ]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
  if [ "$(docker volume inspect -f '{{index .Labels "getprio.bootstrap-owner"}}' "$volume" 2>/dev/null || true)" = "$identity" ]; then
    docker volume rm "$volume" >/dev/null 2>&1 || true
  fi
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM
if docker volume inspect "$volume" >/dev/null 2>&1; then
  printf 'Refusing an existing bootstrap volume.\n' >&2; exit 1
fi
docker volume create --label "getprio.bootstrap-owner=$identity" "$volume" >/dev/null
docker run -d --name "$container" --label "getprio.bootstrap-owner=$identity" --network none \
  -e POSTGRES_USER=getprio_fixture -e POSTGRES_DB=getprio_docker_bootstrap_test \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$volume:/var/lib/postgresql/data" \
  -v "$repo_root/database/init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro" \
  -v "$repo_root/database/docker-migrate.sh:/docker-entrypoint-initdb.d/zz-migrate.sh:ro" \
  -v "$repo_root/database/migrations:/getprio-migrations:ro" postgres:16-alpine >/dev/null
attempt=0
# The entrypoint's initialization server listens on Unix sockets only. Require
# final TCP readiness so assertions cannot race an unfinished migration run.
until docker exec "$container" pg_isready -h 127.0.0.1 -U getprio_fixture -d getprio_docker_bootstrap_test >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 180 ] || [ "$(docker inspect -f '{{.State.Running}}' "$container")" != true ]; then
    docker logs "$container" >&2
    exit 1
  fi
  sleep 1
done
sql() { docker exec -i "$container" psql -h 127.0.0.1 -U getprio_fixture -d getprio_docker_bootstrap_test -v ON_ERROR_STOP=1 -At "$@"; }
expected="$(wc -l < "$repo_root/database/migrations/migration-order.txt" | tr -d ' ')"
actual="$(sql -c 'SELECT count(*) FROM schema_migrations')"
[ "$actual" = "$expected" ] || { printf 'Expected %s migration markers, got %s\n' "$expected" "$actual" >&2; exit 1; }
sql <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='ticket_service_plans'::regclass
    AND conname='ticket_service_plans_contract_version_check' AND pg_get_constraintdef(oid) LIKE '%ARRAY[1, 2, 3, 4]%') THEN
    RAISE EXCEPTION 'Final V4 contract constraint missing';
  END IF;
  IF to_regprocedure('assert_named_pool_capacity()') IS NULL
    OR to_regprocedure('protect_queue_child_history()') IS NULL
    OR to_regprocedure('validate_queue_child_dependency()') IS NULL
    OR to_regprocedure('protect_queue_skipped_stage_history()') IS NULL
    OR to_regprocedure('protect_queue_skipped_group_history()') IS NULL THEN
    RAISE EXCEPTION 'Queue trigger functions missing';
  END IF;
END $$;
SQL
sql -c 'SELECT filename,applied_at FROM schema_migrations ORDER BY filename' > "$work_dir/before"
docker exec "$container" sh /docker-entrypoint-initdb.d/zz-migrate.sh
sql -c 'SELECT filename,applied_at FROM schema_migrations ORDER BY filename' > "$work_dir/after"
cmp "$work_dir/before" "$work_dir/after"
printf 'Fresh Docker bootstrap and exact migration-marker replay passed (%s migrations).\n' "$actual"
