# macOS release on the Mac mini

**Current:** **v0.3.10** is dual-platform on GitHub Releases (Windows + notarized Mac). Use this doc for the **next** Mac ship after a Windows release lands first.

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

## Do this for a tagged release (copy-paste)

Replace `vX.Y.Z` with the tag (Windows artifacts should already be on that GitHub release):

```bash
cd ~/Repos/mnml
git fetch origin --tags --force
git checkout -f vX.Y.Z
# ensure .env.release is in the repo root (copy in if needed)
chmod +x scripts/mac-mini-release.sh
./scripts/mac-mini-release.sh vX.Y.Z
```

What the script does: `npm ci` → arm64 build → sign → notarize → upload to the GitHub release:

- `mnml-mac.dmg`
- `mnml-mac.zip`
- `latest-mac.yml`
- `mnml-mac.zip.blockmap`

When Windows `mnml-setup.exe` is already on that release, the script keeps it as **latest**.

---

## Verify (after the script says Done)

```bash
curl -sL https://mnml.nxyz.art/latest-mac.yml | head -6
# expect: version: X.Y.Z

open https://mnml.nxyz.art/mnml-mac.dmg
# should download the DMG (307 → GitHub)

gh release view vX.Y.Z
# should list both mnml-setup.exe and mnml-mac.dmg
```

Site copy usually ships with the Windows release; Mac upload only needs a Vercel redeploy if site version strings were not updated yet.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Dirty tree / can't checkout tag | `git fetch origin --tags --force && git reset --hard vX.Y.Z && rm -rf node_modules release` |
| `uiohook-napi` is `win32-x64` | Never copy `node_modules` from Windows. `rm -rf node_modules && npm ci` on the Mac. |
| Wrong signing cert | Set `CSC_NAME="Developer ID Application: Your Name (TEAMID)"` in `.env.release` |
| Notarize fails | Confirm app-specific password (not account password); Team ID matches the cert |
| Quick un-notarized smoke only | `npm run build:release:mac -- -c.mac.notarize=false` (do **not** upload that) |
| Interactive zsh `#` comments | Don't paste `#` comment-only lines as commands — run the real commands only |

---

## One-time Apple checklist (you likely already have these)

- [x] Apple Developer Program  
- [x] Developer ID Application cert in Keychain  
- [x] App-specific password  
- [ ] `.env.release` present **in the mnml repo** on the Mac mini (reuse values from your other app)

No App Store Connect listing. Bundle id is `dev.mnml.app` (already in `package.json`).
