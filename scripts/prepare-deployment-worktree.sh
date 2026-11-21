#!/usr/bin/env bash

set -euo pipefail

app_dir="${1:-${DO_APP_DIR:-}}"
if [[ -z "$app_dir" || "$app_dir" != /* || ! -d "$app_dir/.git" ]]; then
  echo "A valid absolute deployment checkout is required." >&2
  exit 1
fi

declare -a unexpected=()
declare -a generated=()
while IFS= read -r status_line; do
  [[ -z "$status_line" ]] && continue
  status="${status_line:0:2}"
  path="${status_line:3}"
  case "$status $path" in
    "?? frontend/dist-customer/"|"?? frontend/dist-vendor/") generated+=("$path") ;;
    "?? frontend/")
      while IFS= read -r child; do
        case "$(basename "$child")" in
          dist-customer|dist-vendor) generated+=("frontend/$(basename "$child")/") ;;
          *) unexpected+=("?? frontend/$(basename "$child")/") ;;
        esac
      done < <(find "$app_dir/frontend" -mindepth 1 -maxdepth 1 -type d -print)
      find "$app_dir/frontend" -mindepth 1 -maxdepth 1 ! -type d -print -quit | grep -q . && unexpected+=("?? frontend/") || true
      ;;
    *) unexpected+=("$status_line") ;;
  esac
done < <(git -C "$app_dir" status --porcelain=v1)

if (( ${#unexpected[@]} > 0 )); then
  echo "Server working tree has unknown local changes. Refusing to deploy." >&2
  printf '%s\n' "${unexpected[@]}" >&2
  exit 1
fi

if (( ${#generated[@]} == 0 )); then
  exit 0
fi

backup_root="${app_dir%/}.generated-output-backup.$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup_root"
for relative in "${generated[@]}"; do
  source="$app_dir/$relative"
  target="$backup_root/${relative%/}"
  mkdir -p "$(dirname "$target")"
  mv -- "$source" "$target"
done
chmod -R go-rwx "$backup_root"
echo "Preserved generated static output drift at $backup_root."
