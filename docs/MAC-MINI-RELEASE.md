# macOS release on the Mac mini

Build, sign, notarize, and upload so **https://mnml.nxyz.art/mnml-mac.dmg** works.
Binaries live on GitHub Releases; the site redirects there (no Vercel upload for the `.dmg`).

## One-time setup

1. **Xcode Command Line Tools** — `xcode-select --install`
2. **Node 20+** — `brew install node`
3. **GitHub CLI** — `brew install gh` then `gh auth login`
4. **Developer ID Application** certificate in Keychain (Apple Developer account)
5. **App-specific password** — [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords
6. **Credentials** — in the repo root:

```bash
cp .env.release.example .env.release
# APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
# Optional: CSC_NAME="Developer ID Application: …"
```

`.env.release` stays on the Mac mini only (gitignored).

## Every macOS release

Clone anywhere you like (e.g. `~/Repos/mnml`):

```bash
mkdir -p ~/Repos
cd ~/Repos
git clone https://github.com/syfpsy/mnml.git
cd mnml
git fetch origin --tags --force
git checkout v0.3.0
cp /path/to/your/.env.release .
chmod +x scripts/mac-mini-release.sh
./scripts/mac-mini-release.sh v0.3.0
```

The script: clean `npm ci` → arm64 build → sign → notarize → upload `mnml-mac.dmg`, `mnml-mac.zip`, `latest-mac.yml` to GitHub.

### Make the website download work

Site links use GitHub **`latest`** release. Right now **v0.2.46** is latest (Windows only); **v0.3.0** is a draft with no files yet.

After `./scripts/mac-mini-release.sh` succeeds:

**If Windows v0.3.0 is also ready** (built on your PC with `release-local-win.ps1`):

```bash
gh release edit v0.3.0 --draft=false --latest
```

**If macOS only for now** (Windows button on the site will 404 until you add `mnml-setup.exe` to v0.3.0):

```bash
gh release edit v0.3.0 --draft=false --latest
```

Then verify:

```bash
curl -sL https://mnml.nxyz.art/latest-mac.yml | head -6
open https://mnml.nxyz.art/mnml-mac.dmg
```

## Troubleshooting

**`git pull` blocked by local changes** — reset to GitHub:

```bash
git fetch origin --tags --force
git reset --hard origin/master
rm -rf node_modules release
npm ci
```

**`uiohook-napi` shows `win32-x64`** — never copy `node_modules` from Windows; `rm -rf node_modules && npm ci` on the Mac.

**Universal build / `x64ArchFiles` error** — pull latest `master` (arm64-only mac target).

**Unsigned test** (no Apple creds):

```bash
SKIP_NOTARIZE=1 npm run build:release:mac
```

## Optional: GitHub Actions later

When Actions minutes are available: **Actions → Release (manual)** → tag + `macos`. Add secrets `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and optionally `CSC_LINK` + `CSC_KEY_PASSWORD`.
