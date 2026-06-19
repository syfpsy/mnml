# mnml — building, releasing & deploying

Two artifacts ship from this repo: the **Windows app** (NSIS installer +
update manifest → **GitHub Releases**) and the **landing site** (static `site/` →
**Vercel**). Internals: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

> ## Safety rules (non-negotiable, from `CLAUDE.md`)
> - **Never deploy to production without explicit confirmation** — `vercel`,
>   `vercel --prod`, `npm run deploy`, deploy hooks, or pushing to `main` when
>   Vercel Git integration is on. Always state what deploys, where, and the impact.
> - **Commit only when asked. Push only when confirmed.**
> - **Never create/push git tags unless requested.** `gh release create` makes a
>   tag — treat it as a release action requiring confirmation.
> - **Never force-push `main`, never run destructive git/release ops, never delete
>   tags/releases** without explicit instruction.
> - **Never skip hooks/signing** unless asked. **Never commit secrets.**

## Toolchain

Windows 10/11 + Node 20+ (tested on 22). `npm install` runs `postinstall`
(`electron-rebuild -f -o better-sqlite3`) to match the native ABI. After an
Electron bump, rerun `npm run rebuild`.

## Versioning

SemVer in `package.json`. `scripts/bump-version.mjs` runs as the **first build
step**: increments **patch** by default; set `"version_next": "0.3.0"` in
`package.json` for a minor/major (the field is consumed + deleted). It also inserts
a dated `## vX.Y.Z` placeholder into `CHANGELOG.md`.

**Discipline** (`CLAUDE.md`): every meaningful change updates `CHANGELOG.md`
(Keep-a-Changelog: Added / Changed / Fixed / Removed / Security / Internal). Never
bump without filling the section; never write unverified notes; mark breaking
changes. Normal flow: **build → fill the new section → commit (when asked).**

## Build commands

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server + Electron, detached DevTools, HMR. |
| `npm run build` | `check:summon` → `bump-version` → `rebuild` → `verify-native-bindings` → `tsc` → `vite build` → `electron-builder` (current OS). |
| `npm run build:release:win` | Windows NSIS only → `release/mnml-setup.exe` + `latest.yml` + blockmap. |
| `npm run build:release:mac` | macOS universal DMG + ZIP → `release/mnml-mac.*` + `latest-mac.yml`. |
| `npm run verify:release` | `node scripts/verify-release-artifacts.mjs [win\|mac\|all]`. |
| `npm run icons` | Regenerate icons from `build/icon.svg`. |
| `npm run check:summon` | Guard for window-summon/focus invariants (runs before every build). |

**Local release scripts (no GitHub Actions):**

| Script | Machine | Does |
| --- | --- | --- |
| `scripts/release-local-win.ps1` | Windows + VS Build Tools | Build + `gh release upload` Windows artifacts. |
| `scripts/mac-mini-release.sh` | Mac mini | Build, sign, notarize, upload macOS artifacts. See [`docs/MAC-MINI-RELEASE.md`](./docs/MAC-MINI-RELEASE.md). |

`electron-builder` config is in `package.json` `build`: appId `dev.mnml.app`,
`asar:false`, `npmRebuild:false`, `afterPack: scripts/copy-native-deps.mjs`,
`afterSign: scripts/notarize-mac.cjs` (macOS only, when Apple env vars set),
`extraResources` ships icons, NSIS x64 (`mnml-setup.exe`), mac universal
(`mnml-mac.dmg` / `mnml-mac.zip`).

## Distribution model (important)

**Binaries live on GitHub Releases. Vercel only redirects.** `vercel.json` (307s):

```
/mnml-setup.exe          → github.com/syfpsy/mnml/releases/latest/download/mnml-setup.exe
/latest.yml              → …/releases/latest/download/latest.yml
/mnml-setup.exe.blockmap → …/releases/latest/download/mnml-setup.exe.blockmap
/mnml-mac.zip            → …/releases/latest/download/mnml-mac.zip
/mnml-mac.dmg            → …/releases/latest/download/mnml-mac.dmg
/latest-mac.yml          → …/releases/latest/download/latest-mac.yml
/mnml-mac.zip.blockmap   → …/releases/latest/download/mnml-mac.zip.blockmap
```

Windows auto-update reads `latest.yml`; macOS reads `latest-mac.yml`. Both
redirect to GitHub **latest** release assets.

> **Why** (cautionary tale): binaries were once served straight from `site/` via
> manual `vercel --prod`. But any git push triggered a Vercel **git-integration**
> deploy built from the repo (no binary), which became production and silently
> 404'd the download + broke auto-update. `[skip ci]` does **not** stop Vercel git
> deploys. Moving binaries to Releases + redirects means a push can't break the
> download. Don't reintroduce same-origin binary serving.

## Auto-update flow

`electron-updater` (packaged only): checks on startup then every 24 h,
`autoDownload`, installs on quit / via the tray entry / the in-app banner. Provider
in `package.json` `build.publish`:

```jsonc
{ "provider": "generic", "url": "https://mnml.nxyz.art/", "channel": "latest" }
```

So it fetches `…/latest.yml`, which **redirects** to the GitHub manifest. (Planned:
switch to `provider: "github"` once signed builds publish to Releases directly.)

## Release runbook (manual — default)

GitHub Actions is **manual-only** (`workflow_dispatch`) to save minutes. Normal
path is local builds + `gh release upload`.

### 1. Prepare the repo

1. Fill `CHANGELOG.md` for the version (already in `package.json`).
2. Commit and push `master`.
3. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

### 2. macOS (Mac mini — sign + notarize)

See **[`docs/MAC-MINI-RELEASE.md`](./docs/MAC-MINI-RELEASE.md)**.

```bash
git clone https://github.com/syfpsy/mnml.git && cd mnml
git checkout vX.Y.Z
cp ~/.config/mnml/.env.release .env.release   # your saved Apple credentials
./scripts/mac-mini-release.sh
```

### 3. Windows (this PC — needs Visual Studio Build Tools)

```powershell
git pull
git checkout vX.Y.Z
.\scripts\release-local-win.ps1
```

Requires `electron-rebuild` (native modules). Install **VS 2022 Build Tools** with
the “Desktop development with C++” workload if `npm run rebuild` fails.

### 4. Site

After the GitHub release is **published** (not draft) with `--latest`:

```bash
npm run check:site-headers
vercel deploy --prod    # confirm first — updates copy only; binaries redirect to GitHub
```

### 5. Publish (when **both** platforms are uploaded)

```bash
gh release edit vX.Y.Z --draft=false --latest
```

The local scripts only auto-publish when **both** `mnml-setup.exe` and `mnml-mac.zip`
are on the same release — so `v0.2.46` stays `latest` for Windows until then.

### 6. Verify

- `https://mnml.nxyz.art/mnml-setup.exe` → 307 → GitHub → 200
- `https://mnml.nxyz.art/latest-mac.yml` → version matches tag
- `npm run verify:release -- all` locally before upload

### GitHub Actions (optional)

When minutes are available: **Actions → Release (manual)** → tag + platform.
Store Apple secrets in the repo for macOS CI notarization.

---

## Release runbook (legacy / reference)

<details>
<summary>Previous single-platform Windows steps</summary>

1. **Build**: `npm run build` (bumps version, runs guard + typecheck + bundle,
   emits the three `release/` artifacts).
2. **Changelog**: fill the new `## vX.Y.Z` section.
3. **Commit** the bump + changelog (when asked).
4. **Publish to GitHub Releases** (a release/tag action — confirm first):
   ```bash
   gh release create vX.Y.Z \
     release/mnml-setup.exe release/latest.yml release/mnml-setup.exe.blockmap \
     --title "vX.Y.Z" --notes "…" --latest
   ```
5. **Verify**: `https://mnml.nxyz.art/mnml-setup.exe` → 307 → GitHub → 200.

</details>

## Site deploy (Vercel)

Pure static `site/`, no build step. `vercel.json`: no-op build/install,
`outputDirectory: "site"`, `cleanUrls`, security headers, immutable image cache,
short CSS/JS cache, the download redirects. **Schema-validated — don't add unknown
keys.**

- Preview: `cd site && python -m http.server 8080` (or `npx http-server`).
- Production: **`vercel --prod` from a local checkout, only after confirmation.**
- Custom domain: Vercel dashboard → Settings → Domains → Add → CNAME to
  `cname.vercel-dns.com`. (The repo's homepage URL should point at the live site.)
- When brand artwork changes, bump the OG filename (`og-vN.png`) to bust caches.

## Code signing

### macOS (Mac mini)

**Developer ID + notarization** via `.env.release` on the Mac mini. See
[`docs/MAC-MINI-RELEASE.md`](./docs/MAC-MINI-RELEASE.md). `scripts/notarize-mac.cjs`
runs automatically after sign when `APPLE_*` env vars are set.

### Windows (in progress)

Not yet signed → SmartScreen "unrecognized app" prompt on first run (More info →
Run anyway). **Plan**: SignPath Foundation (free OSS signing, applied). Until then,
keep the README SmartScreen note accurate.

## Secrets & environment

No `.env` needed to build. The Vercel token lives only in the local CLI config / CI
secrets — **never** committed (a pre-public scan confirmed clean tracked files +
history). `gh auth status` must be authenticated for releases / repo edits. Don't
print secrets; if one is found tracked, warn + remediate without exposing it.
