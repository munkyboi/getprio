#!/usr/bin/env bash

set -euo pipefail

site_file="${NGINX_SITE_FILE:-/etc/nginx/sites-available/getprio}"
developer_site_file="${NGINX_DEVELOPER_SITE_FILE:-/etc/nginx/sites-available/getprio-developer-portal}"
config_dir="${NGINX_CONFIG_DIR:-}"

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
  done < <(find "$config_dir" -maxdepth 1 \( -type f -o -type l \) -print)
fi

require_host() {
  local host="$1"
  if ! grep -Eq "server_name[^;]*${host}([[:space:];]|$)" <<<"$all_contents"; then
    echo "Missing Nginx server_name for ${host}." >&2
    exit 1
  fi
}

require_root() {
  local host="$1" root="$2" contents="$3"
  if ! python3 - "$host" "$root" "$site_file" "$developer_site_file" "$config_dir" <<'PY'
import pathlib
import re
import sys

host, expected_root, *files = sys.argv[1:]
paths = [pathlib.Path(item) for item in files if item]
paths.extend(path for directory in paths[-1:] if directory.is_dir() for path in directory.iterdir()) if paths and paths[-1].is_dir() else None
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
        if names and host in names.group(1).split() and re.search(rf"\broot\s+{re.escape(expected_root)};", block):
            raise SystemExit(0)
raise SystemExit(1)
PY
  then :; else
    echo "Host ${host} is not mapped to the expected root ${root}." >&2
    exit 1
  fi
}

require_root getprio.online /var/www/getprio/frontend/dist "$site_contents"
require_root app.getprio.online /var/www/getprio/frontend/dist-customer "$site_contents"
require_root vendor.getprio.online /var/www/getprio/frontend/dist-vendor "$site_contents"
require_root platform.getprio.online /var/www/getprio/platform-dashboard/dist "$site_contents"
require_root developers.getprio.online /var/www/getprio/developer-portal/dist "$developer_contents"
require_host api.getprio.online
require_host sandbox-api.getprio.online

if ! grep -Fq 'proxy_pass http://127.0.0.1:5000;' <<<"$site_contents" \
  || ! grep -Fq 'proxy_set_header X-GetPrio-Ingress-Host $host;' <<<"$site_contents"; then
  echo "API ingress proxy or sandbox isolation header is missing." >&2
  exit 1
fi

echo "Production host routing verified: marketing, customer, vendor, platform, developers, API and sandbox API."
