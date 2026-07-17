#!/usr/bin/env bash
# mac-mini-release.sh — build, sign, notarize, upload macOS artifacts to GitHub Releases.
#
# Usage:
#   # First time on Mac mini (credentials):
#   cp .env.release.example .env.release   # reuse Apple vars from your other app
#   ./scripts/mac-mini-preflight.sh        # optional sanity check
#
#   # Every release (v0.3.9 already has Windows artifacts on GitHub):
#   git fetch origin --tags --force && git checkout -f v0.3.9
#   ./scripts/mac-mini-release.sh v0.3.9
#
# Docs: docs/MAC-MINI-RELEASE.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -n "$TAG" ]]; then
  git fetch --tags --force origin
  git checkout -f "$TAG"
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="${TAG:-v${VERSION}}"

if [[ -f .env.release ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.release
  set +a
  echo "[release] loaded .env.release"
else
  echo "[release] warning: no .env.release — build may be unsigned / not notarized"
  echo "  cp .env.release.example .env.release  # reuse Apple vars from your other app"
fi

command -v node >/dev/null || { echo "Node 20+ required"; exit 1; }
command -v npm >/dev/null || { echo "npm required"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required (brew install gh)"; exit 1; }

echo "[release] mnml ${VERSION} (${TAG}) on $(uname -m)"

rm -rf node_modules release
npm ci
npm run build:release:mac
npm run verify:release -- mac

NOTES_FILE="$(mktemp)"
node scripts/write-gh-release-notes.mjs "$VERSION" --out "$NOTES_FILE"

if ! gh release view "$TAG" >/dev/null 2>&1; then
  echo "[release] creating GitHub release $TAG"
  gh release create "$TAG" \
    --title "$TAG" \
    --notes-file "$NOTES_FILE" \
    --latest
else
  echo "[release] release $TAG exists — uploading macOS artifacts"
fi

gh release upload "$TAG" \
  release/mnml-mac.zip \
  release/mnml-mac.dmg \
  release/latest-mac.yml \
  release/mnml-mac.zip.blockmap \
  --clobber

# Keep as latest when Windows is already present (normal for mnml after PC build).
if gh release view "$TAG" --json assets -q '.assets[].name' 2>/dev/null | grep -q 'mnml-setup.exe'; then
  echo "[release] Windows + macOS artifacts present — publishing as latest"
  gh release edit "$TAG" --draft=false --latest
else
  echo "[release] macOS uploaded, but Windows installer missing on this tag."
  echo "  On Windows: .\\scripts\\release-local-win.ps1 -Tag $TAG"
  echo "  Then:       gh release edit $TAG --draft=false --latest"
fi

rm -f "$NOTES_FILE"

echo ""
echo "Done. macOS artifacts uploaded to https://github.com/syfpsy/mnml/releases/tag/${TAG}"
echo "Verify:"
echo "  curl -sL https://mnml.nxyz.art/latest-mac.yml | head -5"
echo "  open https://mnml.nxyz.art/mnml-mac.dmg"
