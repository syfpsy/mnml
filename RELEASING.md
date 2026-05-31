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
| `npm run build` | `check:summon` → `bump-version` → `tsc -b` → `vite build` → `electron-builder`. Emits `release/mnml-setup.exe` + `latest.yml` + `mnml-setup.exe.blockmap`. |
| `npm run build:dir` | Same, `--dir` (unpacked, no installer) for quick checks. |
| `npm run release` | Same pipeline with `--publish always` (uses `build.publish`). |
| `npm run icons` | Regenerate icons from `build/icon.svg`. |
| `npm run check:summon` | Guard for the window-summon/focus invariants (runs before every build). |

`electron-builder` config is in `package.json` `build`: appId `dev.mnml.app`,
`asar:false`, `npmRebuild:false`, `afterPack: scripts/copy-native-deps.mjs` (places
the rebuilt native binaries), `extraResources` ships `icon.ico` + `tray.png`, NSIS
x64, `artifactName: mnml-setup.exe`, one-click per-user with shortcuts +
`build/installer.nsh`.

## Distribution model (important)

**Binaries live on GitHub Releases. Vercel only redirects.** `vercel.json` (307s):

```
/mnml-setup.exe          → github.com/syfpsy/mnml/releases/latest/download/mnml-setup.exe
/latest.yml              → …/releases/latest/download/latest.yml
/mnml-setup.exe.blockmap → …/releases/latest/download/mnml-setup.exe.blockmap
```

Download buttons point at `/mnml-setup.exe`. `/releases/latest/download/` always
tracks the newest release, so **future releases need no `vercel.json` change**.

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

## Release runbook (app)

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
   `--latest` is what makes the redirects resolve to this build.
5. **Verify**: `https://mnml.nxyz.art/mnml-setup.exe` → 307 → GitHub → 200;
   `…/latest.yml` shows the new version.
6. **Keep only the latest release live.** After publishing, delete superseded
   releases (and their tags) so the Releases page shows only the current version —
   a confirmed, irreversible action. Old releases don't affect updates (clients read
   `latest.yml`), so cleanup is safe.

> `npm run release` (`--publish always`) can publish during the build instead of the
> manual `gh release create`, but the manual path is the predictable default. Either
> way, publishing is a confirmed action.

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

## Code signing (in progress)

Not yet signed → SmartScreen "unrecognized app" prompt on first run (More info →
Run anyway). Authenticode reputation needs an OV/EV cert on hardware/cloud (a
Turkish business e-imza token is document-signing only — no Code Signing EKU — and
won't work). **Plan**: approved into **SignPath Foundation** (free OSS signing,
applied). Once active: (1) CI builds + submits artifacts to SignPath; (2) publish
the **signed** installer + `latest.yml` to Releases (redirects already serve them);
(3) switch `build.publish` to `provider: "github"`. Until then, keep the
README/privacy SmartScreen note accurate.

## Secrets & environment

No `.env` needed to build. The Vercel token lives only in the local CLI config / CI
secrets — **never** committed (a pre-public scan confirmed clean tracked files +
history). `gh auth status` must be authenticated for releases / repo edits. Don't
print secrets; if one is found tracked, warn + remediate without exposing it.
