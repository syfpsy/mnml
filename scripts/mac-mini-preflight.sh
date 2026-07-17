#!/usr/bin/env bash
# mac-mini-preflight.sh — quick checks before mac-mini-release.sh
# Run on the Mac mini. Does not build or upload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ok=0
fail=0

pass() { echo "  ok  $*"; ok=$((ok + 1)); }
bad()  { echo "  FAIL $*"; fail=$((fail + 1)); }

echo "[preflight] mnml macOS release checks"
echo "  cwd: $ROOT"
echo "  arch: $(uname -m)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  bad "not macOS — run this on the Mac mini"
  exit 1
fi
pass "macOS"

command -v node >/dev/null && pass "node $(node -v)" || bad "node missing (brew install node)"
command -v npm  >/dev/null && pass "npm $(npm -v)"  || bad "npm missing"
command -v gh   >/dev/null && pass "gh $(gh --version | head -1)" || bad "gh missing (brew install gh && gh auth login)"
command -v xcode-select >/dev/null && xcode-select -p >/dev/null 2>&1 \
  && pass "Xcode CLT" || bad "Xcode CLT missing (xcode-select --install)"

if gh auth status >/dev/null 2>&1; then
  pass "gh authenticated"
else
  bad "gh not logged in (gh auth login)"
fi

if [[ -f .env.release ]]; then
  pass ".env.release present"
  # shellcheck disable=SC1091
  set -a; source .env.release; set +a
  [[ -n "${APPLE_ID:-}" ]] && pass "APPLE_ID set" || bad "APPLE_ID empty"
  [[ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]] && pass "APPLE_APP_SPECIFIC_PASSWORD set" || bad "APPLE_APP_SPECIFIC_PASSWORD empty"
  [[ -n "${APPLE_TEAM_ID:-}" ]] && pass "APPLE_TEAM_ID set" || bad "APPLE_TEAM_ID empty"
  if [[ -n "${CSC_NAME:-}" ]]; then
    pass "CSC_NAME=$CSC_NAME"
  else
    echo "  note CSC_NAME unset — ok if only one Developer ID Application cert is in Keychain"
  fi
else
  bad ".env.release missing — cp .env.release.example .env.release and fill Apple vars (reuse from your other app)"
fi

# Developer ID Application cert in Keychain (best-effort)
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  pass "Developer ID Application cert found in Keychain"
  security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | sed 's/^/       /'
else
  bad "no Developer ID Application identity in Keychain"
fi

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "?")"
echo "  package.json version: $VERSION"

if command -v gh >/dev/null && gh release view "v${VERSION}" >/dev/null 2>&1; then
  pass "GitHub release v${VERSION} exists (Windows assets already uploaded)"
else
  echo "  note GitHub release v${VERSION} not found yet — script can create it, but Windows should already be published"
fi

echo ""
if [[ "$fail" -gt 0 ]]; then
  echo "[preflight] $fail check(s) failed — fix those, then re-run."
  exit 1
fi

echo "[preflight] all checks passed ($ok)."
echo "Next:"
echo "  git fetch origin --tags --force && git checkout -f v${VERSION}"
echo "  ./scripts/mac-mini-release.sh v${VERSION}"
