#!/usr/bin/env bash

set -euo pipefail

nginx_site_file="${NGINX_SITE_FILE:-/etc/nginx/sites-available/getprio}"
developer_site_file="${NGINX_DEVELOPER_SITE_FILE:-/etc/nginx/sites-available/getprio-developer-portal}"
developer_enabled_file="${NGINX_DEVELOPER_ENABLED_FILE:-/etc/nginx/sites-enabled/getprio-developer-portal}"
developer_root="${DEVELOPER_PORTAL_ROOT:-/var/www/getprio/developer-portal/dist}"

case "$developer_root" in
  /*) ;;
  *)
    echo "DEVELOPER_PORTAL_ROOT must be an absolute path: $developer_root" >&2
    exit 1
    ;;
esac

if [[ "$developer_root" == *$'\n'* || "$developer_root" == *$'\r'* ]]; then
  echo "DEVELOPER_PORTAL_ROOT cannot contain a newline." >&2
  exit 1
fi

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
  -e '/server_name[[:space:]]+(app\.)?getprio\.online([^;]*);/ { s/[[:space:]]+developers\.getprio\.online//g; }' \
  -e '/server_name[[:space:]]+api\.getprio\.online([^;]*);/ { /sandbox-api\.getprio\.online/! s/;/ sandbox-api.getprio.online;/; }' \
  "$nginx_site_file"

developer_site_tmp="$(mktemp)"
cleanup() {
  rm -f "$developer_site_tmp"
}
trap cleanup EXIT

cat > "$developer_site_tmp" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name developers.getprio.online;

  root $developer_root;
  index index.html;

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NGINX

"${sudo_cmd[@]}" mkdir -p "$(dirname "$developer_site_file")" "$(dirname "$developer_enabled_file")"
"${sudo_cmd[@]}" install -m 644 "$developer_site_tmp" "$developer_site_file"
"${sudo_cmd[@]}" ln -sfn "$developer_site_file" "$developer_enabled_file"

"${sudo_cmd[@]}" nginx -t
"${sudo_cmd[@]}" systemctl reload nginx

echo "Nginx developer hosts are configured: developers.getprio.online (standalone portal) and sandbox-api.getprio.online (API alias)"
