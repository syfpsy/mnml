# macOS release on the Mac mini

**Right now:** finish **v0.3.9** Mac artifacts. Windows is already on GitHub Releases + the update channel. You only need to sign/notarize/upload the Mac build.

You already notarize another app — **reuse the same Apple ID, team, Developer ID cert, and app-specific password.** No new App Store Connect app.

---

## Do this once (if not already done for mnml)

```bash
# Repo (skip clone if you already have it)
mkdir -p ~/Repos && cd ~/Repos
git clone https://github.com/syfpsy/mnml.git   # or: cd ~/Repos/mnml && git fetch --all --tags
cd ~/Repos/mnml

# Credentials — copy from your other app's .env.release, or create fresh
cp .env.release.example .env.release
# Fill APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
# If Keychain has multiple Developer ID certs, set CSC_NAME too
```

`.env.release` is gitignored — never commit it.

Optional sanity check before the long build:

```bash
chmod +x scripts/mac-mini-preflight.sh scripts/mac-mini-release.sh
./scripts/mac-mini-preflight.sh
```

---

## Do this for v0.3.9 (copy-paste)

```bash
cd ~/Repos/mnml
git fetch origin --tags --force
git checkout -f v0.3.9
# ensure .env.release is in the repo root (copy in if needed)
chmod +x scripts/mac-mini-release.sh
./scripts/mac-mini-release.sh v0.3.9
```

What the script does: `npm ci` → arm64 build → sign → notarize → upload to **existing** GitHub release `v0.3.9`:

- `mnml-mac.dmg`
- `mnml-mac.zip`
- `latest-mac.yml`
- `mnml-mac.zip.blockmap`

Windows `mnml-setup.exe` is already on that release, so the script will keep the release as **latest**.

---

## Verify (after the script says Done)

```bash
curl -sL https://mnml.nxyz.art/latest-mac.yml | head -6
# expect: version: 0.3.9

open https://mnml.nxyz.art/mnml-mac.dmg
# should download the DMG (307 → GitHub)

gh release view v0.3.9
# should list both mnml-setup.exe and mnml-mac.dmg
```

Site copy is already live at https://mnml.nxyz.art (v0.3.9). No Vercel step needed after Mac upload.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Dirty tree / can't checkout tag | `git fetch origin --tags --force && git reset --hard v0.3.9 && rm -rf node_modules release` |
| `uiohook-napi` is `win32-x64` | Never copy `node_modules` from Windows. `rm -rf node_modules && npm ci` on the Mac. |
| Wrong signing cert | Set `CSC_NAME="Developer ID Application: Your Name (TEAMID)"` in `.env.release` |
| Notarize fails | Confirm app-specific password (not account password); Team ID matches the cert |
| Quick unsigned smoke only | `SKIP_NOTARIZE=1 npm run build:release:mac` (do **not** upload that) |

---

## One-time Apple checklist (you likely already have these)

- [x] Apple Developer Program  
- [x] Developer ID Application cert in Keychain  
- [x] App-specific password  
- [ ] `.env.release` present **in the mnml repo** on the Mac mini (reuse values from your other app)

No App Store Connect listing. Bundle id is `dev.mnml.app` (already in `package.json`).
