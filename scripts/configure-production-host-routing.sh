#!/usr/bin/env bash

set -euo pipefail

site_file="${NGINX_SITE_FILE:-/etc/nginx/sites-available/getprio}"
app_root="${NGINX_APP_ROOT:-${DO_APP_DIR:-/var/www/getprio}}"
if [[ "$site_file" != /* || "$app_root" != /* || ! -f "$site_file" ]]; then
  echo "An existing absolute Nginx site file and application root are required." >&2
  exit 1
fi

if [[ "${NGINX_SKIP_RELOAD:-0}" == "1" ]]; then
  run_privileged() { "$@"; }
elif [[ "$(id -u)" -eq 0 ]]; then
  run_privileged() { "$@"; }
elif sudo -n true 2>/dev/null; then
  run_privileged() { sudo -n "$@"; }
else
  echo "Root or passwordless sudo is required to update Nginx routing." >&2
  exit 1
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT
python3 - "$site_file" "$app_root" "$tmp_file" <<'PY'
import pathlib
import re
import sys
import os

source, root, target = map(pathlib.Path, sys.argv[1:])
text = source.read_text()
mapping = {
    "getprio.online": f"{root}/frontend/dist",
    "app.getprio.online": f"{root}/frontend/dist-customer",
    "vendor.getprio.online": f"{root}/frontend/dist-vendor",
    "platform.getprio.online": f"{root}/platform-dashboard/dist",
}
server_start = re.compile(r"\bserver\s*\{")
changed = []
out = []
cursor = 0
for match in server_start.finditer(text):
    if match.start() < cursor:
        continue
    depth = 0
    end = None
    for index in range(match.end() - 1, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise SystemExit("Unbalanced Nginx server block.")
    block = text[match.start():end]
    names = re.search(r"\bserver_name\s+([^;]+);", block)
    hosts = set(names.group(1).split()) if names else set()
    replacements = [mapping[host] for host in mapping if host in hosts]
    if replacements:
        expected = replacements[0]
        block, count = re.subn(r"(?m)^([ \t]*)root\s+[^;]+;", rf"\g<1>root {expected};", block)
        if count == 0:
            block = re.sub(r"(\bserver_name\s+[^;]+;)", rf"\1\n  root {expected};", block, count=1)
        changed.extend(host for host in mapping if host in hosts)
    out.append(text[cursor:match.start()])
    out.append(block)
    cursor = end
out.append(text[cursor:])
missing = sorted(set(mapping) - set(changed))
if missing and os.environ.get("NGINX_REQUIRE_ALL", "1") == "1":
    raise SystemExit("Missing production host server block(s): " + ", ".join(missing))
if missing and os.environ.get("NGINX_APPEND_MISSING", "1") == "1":
    out.append("\n")
    for host in missing:
        out.append(
            "server {\n"
            "  listen 80;\n"
            f"  server_name {host};\n"
            f"  root {mapping[host]};\n"
            "  index index.html;\n"
            "  location / { try_files $uri $uri/ /index.html; }\n"
            "}\n"
        )
pathlib.Path(target).write_text("".join(out))
PY

run_privileged install -m 644 "$tmp_file" "$site_file"
if [[ "${NGINX_SKIP_RELOAD:-0}" != "1" ]]; then
  run_privileged nginx -t
  run_privileged systemctl reload nginx
fi
echo "Production static host roots configured in $site_file."
