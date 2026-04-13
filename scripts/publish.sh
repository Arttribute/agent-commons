#!/usr/bin/env bash
# scripts/publish.sh — Build and publish all public packages.
#
# Called by the changesets/action CI step AFTER it has already bumped
# package.json versions and committed them. This script must NOT prompt,
# must NOT bump versions, and must NOT commit anything.
#
# Usage (manual):  ./scripts/publish.sh
# Usage (CI):      triggered via `publish: pnpm release` in changesets/action

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PACKAGES=(
  "packages/commons-sdk"
  "packages/agc-cli"
)

pkg_name()    { node -p "require('${1}/package.json').name"; }
pkg_version() { node -p "require('${1}/package.json').version"; }

echo ""
echo "  Building packages…"
cd "$REPO_ROOT"
pnpm --filter @agent-commons/sdk build
pnpm --filter @agent-commons/cli build
echo "  Build complete."

echo ""
echo "  Publishing packages…"
for pkg in "${PACKAGES[@]}"; do
  pkgdir="$REPO_ROOT/$pkg"
  name="$(pkg_name "$pkgdir")"
  version="$(pkg_version "$pkgdir")"
  echo "  → ${name}@${version}"
  cd "$pkgdir"
  pnpm publish --access public --no-git-checks
  cd "$REPO_ROOT"
done

echo ""
echo "  Published successfully."
echo ""
