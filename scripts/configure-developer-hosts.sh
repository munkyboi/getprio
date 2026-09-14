#!/usr/bin/env bash

set -euo pipefail

nginx_site_file="${NGINX_SITE_FILE:-/etc/nginx/sites-available/getprio}"

if [ ! -f "$nginx_site_file" ]; then
  echo "Nginx site file not found: $nginx_site_file" >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  sudo_cmd=()
elif sudo -n true 2>/dev/null; then
  sudo_cmd=(sudo -n)
else
  echo "Root or passwordless sudo is required to update Nginx." >&2
  exit 1
fi

if ! grep -Eq 'server_name[[:space:]]+getprio\.online([[:space:];]|$)' "$nginx_site_file"; then
  echo "Expected getprio.online Nginx server block was not found." >&2
  exit 1
fi

if ! grep -Eq 'server_name[[:space:]]+api\.getprio\.online([[:space:];]|$)' "$nginx_site_file"; then
  echo "Expected api.getprio.online Nginx server block was not found." >&2
  exit 1
fi

"${sudo_cmd[@]}" sed -i \
  -e 's/server_name getprio\.online;/server_name getprio.online developers.getprio.online;/g' \
  -e 's/server_name api\.getprio\.online;/server_name api.getprio.online sandbox-api.getprio.online;/g' \
  "$nginx_site_file"

"${sudo_cmd[@]}" nginx -t
"${sudo_cmd[@]}" systemctl reload nginx

echo "Nginx developer host aliases are configured: developers.getprio.online and sandbox-api.getprio.online"
