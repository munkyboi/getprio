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

if ! grep -Eq 'server_name[[:space:]]+(app\.)?getprio\.online([[:space:];]|$)' "$nginx_site_file"; then
  echo "Expected app.getprio.online or getprio.online Nginx server block was not found." >&2
  exit 1
fi

if ! grep -Eq 'server_name[[:space:]]+api\.getprio\.online([[:space:];]|$)' "$nginx_site_file"; then
  echo "Expected api.getprio.online Nginx server block was not found." >&2
  exit 1
fi

"${sudo_cmd[@]}" sed -i -E \
  -e '/server_name[[:space:]]+(app\.)?getprio\.online([^;]*);/ { /developers\.getprio\.online/! s/;/ developers.getprio.online;/; }' \
  -e '/server_name[[:space:]]+api\.getprio\.online([^;]*);/ { /sandbox-api\.getprio\.online/! s/;/ sandbox-api.getprio.online;/; }' \
  "$nginx_site_file"

"${sudo_cmd[@]}" nginx -t
"${sudo_cmd[@]}" systemctl reload nginx

echo "Nginx developer host aliases are configured: developers.getprio.online and sandbox-api.getprio.online"
