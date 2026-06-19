#!/usr/bin/env bash
# mac-mini-release.sh — build, sign, notarize, and upload macOS release artifacts.
#
# Run on a Mac with Xcode CLT, Apple Developer ID cert in Keychain, and gh auth.
# Does NOT use GitHub Actions (saves CI minutes).
#
# Usage:
#   git clone https://github.com/syfpsy/mnml.git && cd mnml
#   cp .env.release.example .env.release   # fill in Apple + optional CSC_NAME
#   ./scripts/mac-mini-release.sh          # builds package.json version
#   ./scripts/mac-mini-release.sh v0.3.0   # explicit tag (checks out tag first)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -n "$TAG" ]]; then
  git fetch --tags origin
  git checkout "$TAG"
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
fi

command -v node >/dev/null || { echo "Node 20+ required"; exit 1; }
command -v npm >/dev/null || { echo "npm required"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required (brew install gh)"; exit 1; }

echo "[release] mnml ${VERSION} (${TAG}) on $(uname -m)"

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

# Only mark latest when Windows artifacts are also present (keeps v0.2.46
# serving /mnml-setup.exe until this PC runs release-local-win.ps1).
if gh release view "$TAG" --json assets -q '.assets[].name' 2>/dev/null | grep -q 'mnml-setup.exe'; then
  echo "[release] Windows + macOS artifacts present — publishing as latest"
  gh release edit "$TAG" --draft=false --latest
else
  echo "[release] macOS uploaded. Release stays draft until Windows artifacts are added."
  echo "  On Windows: .\\scripts\\release-local-win.ps1 -Tag $TAG"
  echo "  Then:       gh release edit $TAG --draft=false --latest"
fi

rm -f "$NOTES_FILE"

echo ""
echo "Done. macOS artifacts uploaded to https://github.com/syfpsy/mnml/releases/tag/${TAG}"
echo "Verify: curl -sL https://mnml.nxyz.art/latest-mac.yml | head -5"
