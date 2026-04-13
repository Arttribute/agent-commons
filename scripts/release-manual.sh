#!/usr/bin/env bash
# scripts/release.sh — Bump, build, and publish all public packages in lockstep.
#
# Usage:
#   ./scripts/release.sh              # patch bump (default)
#   ./scripts/release.sh minor        # minor bump
#   ./scripts/release.sh major        # major bump
#   ./scripts/release.sh 1.2.3        # explicit version
#
# What it does:
#   1. Computes the next version for all public packages
#   2. Writes the new version into every package.json that is published
#   3. Builds SDK then CLI (CLI embeds the version at build time via tsup define)
#   4. Publishes each package to npm
#   5. Commits the version bump and tags the release in git
#
# Requirements: pnpm, node, npm (for publish), jq

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUMP="${1:-patch}"

# ── Packages to publish (in dependency order) ─────────────────────────────────
PACKAGES=(
  "packages/commons-sdk"
  "packages/agc-cli"
)

# ── Helpers ───────────────────────────────────────────────────────────────────

pkg_version() { jq -r '.version' "$1/package.json"; }
pkg_name()    { jq -r '.name'    "$1/package.json"; }

bump_version() {
  local current="$1"
  local bump="$2"

  if [[ "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$bump"
    return
  fi

  IFS='.' read -r major minor patch <<< "$current"
  case "$bump" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *)     echo "Unknown bump type: $bump" >&2; exit 1 ;;
  esac
}

# ── Determine new version from the first package ─────────────────────────────

CURRENT_VERSION="$(pkg_version "$REPO_ROOT/${PACKAGES[0]}")"
NEW_VERSION="$(bump_version "$CURRENT_VERSION" "$BUMP")"

echo ""
echo "  Agent Commons Release"
echo "  ─────────────────────────────────────────────"
echo "  Current  →  $CURRENT_VERSION"
echo "  New      →  $NEW_VERSION"
echo "  Bump     →  $BUMP"
echo ""

read -p "  Proceed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

echo ""

# ── Step 1: Update all package.json versions ──────────────────────────────────

echo "  [1/4] Bumping versions…"
for pkg in "${PACKAGES[@]}"; do
  pkgdir="$REPO_ROOT/$pkg"
  name="$(pkg_name "$pkgdir")"
  # Use node to update package.json so jq is not strictly required for writing
  node -e "
    const fs = require('fs');
    const p = '${pkgdir}/package.json';
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    json.version = '${NEW_VERSION}';
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
  "
  echo "       ${name} → ${NEW_VERSION}"
done

# ── Step 2: Build ─────────────────────────────────────────────────────────────

echo ""
echo "  [2/4] Building packages…"
cd "$REPO_ROOT"
# Build SDK first (CLI depends on it)
pnpm --filter @agent-commons/sdk build
# Build CLI — tsup will embed the new version via __CLI_VERSION__
pnpm --filter @agent-commons/cli build

echo "       Build complete."

# ── Step 3: Verify version ────────────────────────────────────────────────────

echo ""
echo "  [3/4] Verifying built version…"
BUILT_VERSION="$(node "$REPO_ROOT/packages/agc-cli/dist/bin.js" -v 2>/dev/null || echo 'unknown')"
if [[ "$BUILT_VERSION" != "$NEW_VERSION" ]]; then
  echo "  ERROR: built CLI reports '$BUILT_VERSION', expected '$NEW_VERSION'" >&2
  exit 1
fi
echo "       agc -v → $BUILT_VERSION  ✓"

# ── Step 4: Publish ───────────────────────────────────────────────────────────

echo ""
echo "  [4/4] Publishing to npm…"
for pkg in "${PACKAGES[@]}"; do
  pkgdir="$REPO_ROOT/$pkg"
  name="$(pkg_name "$pkgdir")"
  echo "       Publishing ${name}@${NEW_VERSION}…"
  cd "$pkgdir"
  pnpm publish --access public --no-git-checks
  cd "$REPO_ROOT"
done

# ── Git commit & tag ──────────────────────────────────────────────────────────

echo ""
echo "  Committing version bump…"
git add packages/commons-sdk/package.json packages/agc-cli/package.json
git commit -m "chore: release v${NEW_VERSION}"
git tag "v${NEW_VERSION}"

echo ""
echo "  ─────────────────────────────────────────────"
echo "  Released v${NEW_VERSION}  ✓"
echo ""
echo "  Next steps:"
echo "    git push && git push --tags"
echo ""
