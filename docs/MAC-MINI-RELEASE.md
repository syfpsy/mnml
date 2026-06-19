# macOS release on the Mac mini

Sign and notarize from your Mac mini **without GitHub Actions**. The Windows
installer is built separately (see [`RELEASING.md`](../RELEASING.md)).

## One-time setup (Mac mini)

1. **Xcode Command Line Tools** — `xcode-select --install`
2. **Node 20+** — `brew install node` (or nvm)
3. **GitHub CLI** — `brew install gh` then `gh auth login`
4. **Developer ID Application** cert in Keychain (Apple Developer account)
5. **App-specific password** — [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords
6. **Credentials file** — in the repo root after clone:

```bash
cp .env.release.example .env.release
# Edit: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
# Optional: CSC_NAME="Developer ID Application: …" if auto-detect fails
```

Store `.env.release` only on the Mac mini. It is gitignored.

## Every release

```bash
git clone https://github.com/syfpsy/mnml.git
cd mnml
git checkout v0.3.0          # or: ./scripts/mac-mini-release.sh v0.3.0
cp /path/to/.env.release .     # reuse your saved credentials
chmod +x scripts/mac-mini-release.sh
./scripts/mac-mini-release.sh
```

The script will:

## On your Mac mini (reset local edits, then build)

Local edits to `build/icon-512.png`, `build/icon.ico`, and `scripts/mac-mini-release.sh` block `git pull`. Reset to match GitHub, then build:

```bash
cd ~/motion/mnml
git fetch origin --tags --force
git reset --hard origin/master
rm -rf node_modules release
npm ci
npm run build:release:mac
```

`npm ci` must show `postinstall` running `node scripts/rebuild-native.mjs` (not bare `electron-rebuild`). Verify should show `darwin-arm64`, not `win32-x64`.

2. **Sign** via Keychain / `CSC_NAME` (electron-builder)
3. **Notarize** via `scripts/notarize-mac.cjs` when Apple env vars are set
4. Create or update the GitHub release and upload `mnml-mac.*` + `latest-mac.yml`

## Verify

```bash
curl -sL https://mnml.nxyz.art/latest-mac.yml | head -6
spctl -a -vv release/mac-unpacked/mnml.app   # after build:dir, optional
```

## Unsigned test build

```bash
SKIP_NOTARIZE=1 npm run build:release:mac
```

## CI later (optional)

When GitHub Actions minutes are available: **Actions → Release (manual)** → pick tag and `macos`. Add repository secrets `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and optionally `CSC_LINK` + `CSC_KEY_PASSWORD`.
