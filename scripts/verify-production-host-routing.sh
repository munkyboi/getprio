#!/usr/bin/env bash

set -euo pipefail

site_file="${NGINX_SITE_FILE:-/etc/nginx/sites-available/getprio}"
developer_site_file="${NGINX_DEVELOPER_SITE_FILE:-/etc/nginx/sites-available/getprio-developer-portal}"

for required in "$site_file" "$developer_site_file"; do
  if [[ ! -f "$required" ]]; then
    echo "Required Nginx configuration is missing: $required" >&2
    exit 1
  fi
done

site_contents="$(cat "$site_file")"
developer_contents="$(cat "$developer_site_file")"
all_contents="$site_contents\n$developer_contents"

require_host() {
  local host="$1"
  if ! grep -Eq "server_name[^;]*${host}([[:space:];]|$)" <<<"$all_contents"; then
    echo "Missing Nginx server_name for ${host}." >&2
    exit 1
  fi
}

require_root() {
  local host="$1" root="$2" contents="$3"
  if ! grep -Eq "server_name[^;]*${host}([[:space:];]|$)" <<<"$contents" || ! grep -Fq "root ${root};" <<<"$contents"; then
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
