#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

for package_root in "$repo_root" "$repo_root/platform-dashboard-shadcn"; do
  for tool in vite tsc; do
    executable="$package_root/node_modules/.bin/$tool"
    if [[ ! -x "$executable" ]]; then
      echo "Deployment build tool missing or not executable: $executable" >&2
      echo "Install dev dependencies with npm ci --include=dev --bin-links=true before deploying." >&2
      exit 1
    fi
    "$executable" --version
  done
done

echo "Deployment build tools verified."
