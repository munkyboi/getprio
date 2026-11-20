#!/usr/bin/env bash

set -euo pipefail

site_file="${NGINX_SITE_FILE:-/etc/nginx/sites-available/getprio}"
developer_site_file="${NGINX_DEVELOPER_SITE_FILE:-/etc/nginx/sites-available/getprio-developer-portal}"
config_dir="${NGINX_CONFIG_DIR:-}"
app_root="${NGINX_APP_ROOT:-${DO_APP_DIR:-/var/www/getprio}}"
while [[ "$app_root" != "/" && "$app_root" == */ ]]; do
  app_root="${app_root%/}"
done

if [[ "$app_root" != /* ]]; then
  echo "An absolute Nginx application root is required." >&2
  exit 1
fi

for required in "$site_file" "$developer_site_file"; do
  if [[ ! -f "$required" ]]; then
    echo "Required Nginx configuration is missing: $required" >&2
    exit 1
  fi
done

site_contents="$(cat "$site_file")"
developer_contents="$(cat "$developer_site_file")"
all_contents="$site_contents\n$developer_contents"

if [[ -n "$config_dir" && -d "$config_dir" ]]; then
  while IFS= read -r config_file; do
    all_contents+="\n$(cat "$config_file")"
  done < <(find "$config_dir" \( -type f -o -type l \) -print)
fi

require_host() {
  local host="$1"
  if ! grep -Eq "server_name[^;]*${host}([[:space:];]|$)" <<<"$all_contents"; then
    echo "Missing Nginx server_name for ${host}." >&2
    exit 1
  fi
}

require_root() {
  local host="$1" root="$2" contents="$3"; local https="${4:-0}"
  if python3 - "$host" "$root" "$https" "$site_file" "$developer_site_file" "$config_dir" <<'PY'
import pathlib
import re
import sys

host, expected_root, require_https, *files = sys.argv[1:]
require_https = require_https == "1"
paths = []
for item in files:
    if not item:
        continue
    path = pathlib.Path(item)
    paths.extend(path.rglob("*") if path.is_dir() else [path])
found = False
found_https = False
mismatches = []
for path in paths:
    if not path.is_file():
        continue
    text = path.read_text(errors="replace")
    for match in re.finditer(r"\bserver\s*\{", text):
        depth = 0
        end = None
        for index in range(match.end() - 1, len(text)):
            depth += text[index] == "{"
            depth -= text[index] == "}"
            if depth == 0:
                end = index + 1
                break
        block = text[match.start():end] if end else ""
        names = re.search(r"\bserver_name\s+([^;]+);", block)
        if names and host in names.group(1).split():
            found = True
            if re.search(r"\blisten\s+(?:\[::\]:)?443(?:\s+ssl)?\s*;", block):
                found_https = True
            if not re.search(rf"\broot\s+{re.escape(expected_root)};", block):
                roots = re.findall(r"\broot\s+([^;]+);", block)
                mismatches.append((str(path), roots))
if mismatches:
    print(f"{host}: active blocks have roots {mismatches}; expected {expected_root}", file=sys.stderr)
    raise SystemExit(1)
raise SystemExit(0 if found and (not require_https or found_https) else 1)
PY
  then :; else
    echo "Host ${host} is not mapped to the expected root ${root}." >&2
    exit 1
  fi
}

require_root getprio.online "${app_root}/frontend/dist" "$site_contents" "${NGINX_REQUIRE_HTTPS:-0}"
require_root app.getprio.online "${app_root}/frontend/dist-customer" "$site_contents" "${NGINX_REQUIRE_HTTPS:-0}"
require_root vendor.getprio.online "${app_root}/frontend/dist-vendor" "$site_contents" "${NGINX_REQUIRE_HTTPS:-0}"
require_root platform.getprio.online "${app_root}/platform-dashboard/dist" "$site_contents" "${NGINX_REQUIRE_HTTPS:-0}"
require_root developers.getprio.online "${app_root}/developer-portal/dist" "$developer_contents" "${NGINX_REQUIRE_HTTPS:-0}"
require_host api.getprio.online
require_host sandbox-api.getprio.online

if ! grep -Fq 'proxy_pass http://127.0.0.1:5000;' <<<"$site_contents" \
  || ! grep -Fq 'proxy_set_header X-GetPrio-Ingress-Host $host;' <<<"$site_contents"; then
  echo "API ingress proxy or sandbox isolation header is missing." >&2
  exit 1
fi

echo "Production host routing verified: marketing, customer, vendor, platform, developers, API and sandbox API."
