# mnml Changelog

## Unreleased

### Security
- **Dependency patches** — `vite` pinned to `^6.4.3` (CVE-2025-62522 / dev-server `fs.deny` bypass on Windows); `electron` upgraded to `^42.3.3` (patched Chromium/Electron advisories).
- **Marketing site headers** — `vercel.json` now sends `X-Frame-Options: DENY` and a scoped `Content-Security-Policy` (clickjacking + CSP findings on the Vercel site).
- **Header verification** — `npm run check:site-headers` validates `vercel.json`; optional live check via `MNML_SITE_URL`.

## v0.2.44 — 2026-05-31

Reliability release: click-to-paste and window close work together, security hardening, and a full bug-hunt pass.

### Fixed
- **Row click did not reliably paste and close** — `restore` / `savedRestore` with `paste: true` copy, hide, and arm paste atomically in the main process (respects **Auto-paste** setting).
- **Click-to-paste reopened mnml instead of pasting** — capture the previous app's HWND before `win.show()`; native `focus` no longer overwrites it with mnml's own HWND.
- **Dismiss during summon could reopen the window** — cancel in-flight `capture` on hide; ignore stale helper `prev` replies.
- **Paste restore cancelled by a second hide** — only clear the foreground-restore timer when the hide is not arming auto-paste.
- **Summon `focus-ok` could trigger paste early** — helper now emits `focus-ok` / `restore-ok` so paste only follows a restore response.
- **Stuck “Searching…” state** — `use-items` clears `searchPending` in `finally` and on IPC errors.
- **Rapid delete restored wrong rows** — delete uses a functional state update; failed remove refetches.
- **App launch failure still hid mnml** — hide only after successful `appLaunch`.
- **Image restore read unsafe/missing paths** — validate under `images/`; skip missing/unreadable files instead of pasting preview text.
- **Snippet double-submit** — add form disables Save while saving.
- **Settings load/update races** — sequence guard on updates; failed settings fetch handled.
- **ArrowUp from first clipboard row** — returns focus to search (matches snippets/apps lists).
- **`maxItems` ≤ 0** — clamped to 1–10000 on save.

## v0.2.43 — 2026-05-31

Security hardening from static analysis: path traversal guards, CI runner pin, and string-replacement hygiene.

### Security
- **Path traversal hardening** — shared `resolvePathWithinBase` / `assertSafeBasename` guards on DB paths, image files, Start Menu walks, build scripts, and log file location; image deletes and thumbnail reads validate paths stay under the managed `images/` directory.
- **CI runner pin** — release workflow uses `windows-2022` instead of floating `windows-latest`.

### Fixed
- **Incomplete string replacement** — global regex in tab `id` derivation; `replaceAll` for ISO timestamps in logs.

## v0.2.42 — 2026-05-31

Full bug-hunt release: window stays open when you click buttons, auto-paste lands the right content, and a dozen keyboard/focus/privacy fixes.

### Fixed
- **Window dismissed on every in-app button click** — deferred blur→hide with in-window pointer suppression.
- **Text restore pasted screenshot instead of text** — `clipboard.clear()` before every restore write.
- **App launch command injection** — targets allowlisted against the app index only.
- **uIOhook never started if double-Alt failed** — hook starts independently for click-outside and paste.
- **Auto-paste before foreground restore finished** — paste on helper ok/miss with timeout fallback; fresh HWND each summon.
- **Sensitive-content guard failed open** — fail closed on format-query errors.
- **Async link titles for deleted items** — re-check row exists before emit.
- **Thumbnail cache stale after monitor trim** — shared thumb-cache module.
- **`onItemUpdated` IPC listener leak** on tab toggle.
- **Stale search rows during debounce** — wrong Ctrl+1..9 / Enter targets; now clears + `searchPending` guard.
- **Settings Tab focus escaped to Update banner** — focus trap on sheet.
- **Pin reorder wrong keyboard highlight** — reset focus on order change.
- **Clipboard listbox missing focus init** — `onFocus` selects first row.
- **First summon skipped sync refetch** — read storage on each show.
- **Pin/remove optimistic updates stuck on IPC failure** — rollback on error.
- **Search debounce hid list with no loading state** — "Searching…" while pending.
- **In-flight auto-paste timers survived normal hide** — cancel on `hideWindow()`.

### Changed
- Auto-update and site URL now point at **`https://mnml.nxyz.art/`**.


## v0.2.41 — 2026-05-31

Stability and keyboard polish: mnml recovers when the tray outlives the window, Escape behaves predictably everywhere, and shift-click copy finally works on rows.

### Fixed
- **Tray icon alive but Alt-Alt does nothing** — renderer crash / visibility desync no longer leaves a zombie tray app; the main process reloads or recreates the window and reconciles the visibility flag.
- **Escape key conflicts** — Settings sheet, search (clear then dismiss), and snippet add form no longer fight the global hide handler.
- **Clear history left stale rows** — list empties immediately after Settings → Clear history.
- **Sensitive-content guard gap at monitor start** — concealed clipboard content is never read when monitoring boots or is toggled on.
- **IPv6 SSRF gap in link title fetch** — bracketed IPv6 hostnames in copied URLs are blocked.
- **Shift-click to copy on rows** — footer promise now matches behaviour on clipboard items and saved snippets.
- **Pin toggle flicker** — pinned items reorder smoothly without a full refetch.
- **Image restore monitor fingerprint** — restoring an image updates the poll baseline so same-size replacements aren't missed.

### Changed
- Footer hints: `Ctrl 1-9 paste · Shift-click copy · Esc dismiss`.
- Saved tab: arrow-up from the first snippet returns focus to search.
- Quick-paste only intercepts Ctrl+1..9 when it actually pastes.


## v0.2.40 — 2026-05-22

Two improvements from an 80/20 product pass: mnml stops capturing sensitive content, and adds quick-paste hotkeys. Plus a surfaced "free win" — paste already strips formatting.

### Added
- **Quick-paste — Ctrl+1 through Ctrl+9.** Summon, then press Ctrl + a number to paste that item instantly, no arrowing. Targets the current tab's primary list (clipboard items, or snippets on the Saved tab). The first nine rows show a subtle index badge so it's discoverable and you can see which number maps to which item. Chosen over bare digits (they're needed for typing into search) and over Alt (collides with the double-Alt summon and Windows alt-codes). Guarded so it never fires while Settings is open or while you're typing into the snippet editor.
- **Sensitive-content guard — mnml never stores your passwords.** The clipboard monitor now checks the Windows "do not record" markers before reading anything: `ExcludeClipboardContentFromMonitorProcessing` (set by 1Password, KeePass / KeePassXC, Bitwarden, and browsers on password fields) and `CanIncludeInClipboardHistory == 0`. Flagged content is skipped entirely — never read into memory, never hashed, never written to the SQLite file (and so never folder-synced to your cloud). Fail-open: if the format query ever errors, capture behaves exactly as before. Logged once per concealed episode (never *what* was concealed). Validated end-to-end via Electron clipboard spikes.

### Changed
- **Footer + landing copy** now teach quick-paste ("Ctrl 1-9 to paste") and note that paste strips formatting (a latent feature — mnml stores and re-writes plain text, so you always get clean text out). The "Local only" principle on the site now leads with "never your passwords."

### Internal
- `QuickNum` index-badge component shared by `items-list` + `saved-list`.
- The Ctrl+1..9 listener is a single window-level handler routed through a ref, so it sees current state without re-subscribing each render.
- Also folds in the audit-pass-6 + cleanup work that hadn't shipped yet: refetch-on-summon is now gated behind `!isDefault` (default-location users skip the wasted summon refetch); removed dead code (`CopyIcon`, `SparkleIcon`, `allForIndex()`, `trimToMax`'s unused return, the unreferenced `tray@2x.png` asset, `useSaved`'s unused `all`).


## v0.2.39 — 2026-05-18

Folder-sync, made to actually work. The v0.2.34 "Storage folder" feature let you point mnml at a Dropbox / OneDrive / iCloud folder, but mnml is an always-on tray app — it held the synced `mnml.sqlite` open 24/7, so the cloud service could never cleanly replace it with another device's copy. You'd get diverging `.conflict` files instead of sync. This release fixes the connection lifecycle so one-device-at-a-time folder sync genuinely works.

### Fixed
- **The synced DB file is no longer held open.** New idle-close: the SQLite connection drops 5 s after the last access. mnml's DB usage is bursty (a clipboard capture here, a summon-and-search there), so between bursts the `mnml.sqlite` file goes "free" — the cloud-sync service can then replace it with the other device's copy without forcing a `.conflict` file. The next operation reopens the connection fresh (~1 ms). Pairs with a once-per-process `migrate()` guard so reopening stays cheap.
- **Clipboard monitor no longer pins the connection open.** `poll()` ran every 500 ms and called `getSetting("monitoring")` → `getDb()` on every tick, which kept re-arming the idle-close timer and would have defeated it entirely. Removed the redundant check — the poll timer only runs while monitoring is enabled anyway (`start()` / `stop()` are driven directly by the setting), so `poll()` now touches the DB only when it actually captures an item.
- **Journal mode adapts to the data location.** Default `%APPDATA%` location keeps WAL (faster, never synced — its `-wal` / `-shm` sidecars are harmless). A custom (likely synced) folder switches to `DELETE`, the classic rollback journal: after every commit the single `mnml.sqlite` file is self-consistent, so a cloud service can sync just that one file safely. WAL's sidecar files would otherwise sync out of step and corrupt the DB.

### Changed
- **The window reloads its lists on every summon.** The renderer stays mounted between summons, so it used to show whatever it last loaded. Now an `onVisibilityChanged` → visible event re-queries clipboard items + saved snippets. Since the DB connection idle-closes between summons, a summon reopens it fresh — so anything another device synced into a shared folder shows up the moment you press Alt-Alt, no restart needed.
- **Settings > Storage folder hint reworded.** Dropped the scary "Don't run two devices on the same synced folder at the same time" line. New copy explains the reload-on-summon behavior and keeps an honest "best one device at a time; editing on two at once may leave a conflict file" note.

### Notes
- This is one-at-a-time sync by design — $0, no server, no account, data only ever in your own cloud storage. Both machines genuinely active at the same instant can still produce an occasional conflict file; that's the trade for zero infrastructure.
- Works with any folder-sync backend: Dropbox, OneDrive, iCloud Drive, Syncthing, a network share — anything that syncs a folder.


## v0.2.38 — 2026-05-15

Big release. New brand identity (proper app icon, finally), real app icons in the launcher (not generic shortcut overlays), a configurable storage folder rounded into shape, plus the five queued bug-fixes from the post-v0.2.37 hunt.

### Added — brand
- **First proper app icon.** Replaces the Electron-default icon. Master design at `build/icon.svg`: small-caps "M" with V counterform (real typography technique using SVG `fill-rule="evenodd"`), warm orange dot at the M's baseline-right, on a cool-dark rounded square. Modern, minimal, intentional.
- **`scripts/make-icons.mjs`** renders the master SVG into a multi-resolution Windows ICO (7 sizes: 16, 24, 32, 48, 64, 128, 256) plus tray PNGs. No new project dependencies — uses the existing `npx sharp-cli` toolchain for PNG rasterisation; hand-rolled ~30 lines of buffer math assembles the ICO container.
- **`npm run icons`** regenerates everything from the master SVG.
- **electron-builder wired** via `package.json` `build.win.icon: "build/icon.ico"` so the installer + executable embed the new icon. `extraResources` copies `tray.png` / `tray@2x.png` / `icon.ico` into the packaged app's Resources directory.
- **BrowserWindow gets the icon** via `icon:` option so the title-bar / Alt-Tab thumbnail / taskbar match the executable.
- **Tray icon** now loads the multi-resolution ICO (not a single 16-px PNG). Windows picks the right size per DPI scaling — no more upscale-blur on HiDPI displays.
- **Site favicon** redesigned to the same brand mark, scaled to 32 px. Old emerald dot retired.
- **OG card** rebuilt: M + dot logomark on the left, "mnml" wordmark on the right, warm radial glow behind the mark. Served as `og-v2.png` (suffix-versioned URL busts the 30-day immutable CDN + browser cache + social-platform unfurl cache so re-brands actually propagate).
- **`--brand-dot` token** introduced in both `src/styles.css` and `site/styles.css`. Dark mode `#fb923c` (orange-400), light mode `#ea580c` (orange-600) for ≥3:1 non-text contrast against the warm cream bg. Used in the site wordmark + footer dots and the Settings panel's about-line.
- **Two-tier brand documented** as an inline CSS comment: full logomark (M + dot) for icon / OG / marketing; compact wordmark (•mnml) for inline UI surfaces. UI primary actions stay emerald; orange is reserved for identity.

### Fixed — launcher
- **Real app icons in the launcher.** Previously every Start-Menu shortcut showed Windows' generic shortcut overlay icon (a page with a small arrow). Root cause: `app.getFileIcon()` was called on the `.lnk` path itself, which returns the shortcut overlay. **Fix:** resolve the `.lnk` via `shell.readShortcutLink()` first, then call `getFileIcon()` on the resolved target executable. Falls back to the `.lnk` itself if resolution fails (UWP launchers, corrupted shortcuts). Also bumped icon size from `"small"` (16) to `"large"` (48) — crisper at the 24-px UI tile, especially on HiDPI.

### Fixed — storage migration
- **Storage migration "Already using this folder" left the Settings button stuck on "Migrating…".** The IPC didn't tell the renderer whether the app was actually going to restart, so the no-op success path got treated like a migration-imminent path and `busy` stayed locked. **Fix:** IPC `storageSet` / `storageReset` now return `changed: boolean`. Renderer handles three branches: error / no-op success (clears busy) / migration-imminent (keeps busy locked for the auto-restart).
- **Orphaned files on migration rollback.** If the file copy succeeded but the pointer-write failed, the target folder kept the orphan `mnml.sqlite` + `images/`. **Fix:** new `rollbackCopy(target)` helper deletes the copied files on error. Best-effort (each unlink wrapped in try/catch). Skipped when we adopted existing data so we never delete the user's existing canonical data.
- **Storage IPC migration rollback unconditionally restarted the clipboard monitor.** If the user had `monitoring: false`, rollback turned the 500-ms poller back on against their setting. **Fix:** capture `monitoringWasOn` before stopping; only restart if it was on.
- **closeDb happened before stopMonitor**, opening a ~1 ms window where an in-flight poll could re-open the DB connection we were trying to drop. **Fix:** swapped order — `stopMonitor()` then `closeDb()`.

### Fixed — shutdown + cleanup
- **`before-quit` didn't `closeDb()` or `stopMonitor()`.** SQLite left a stale `-wal` sidecar; the clipboard timer kept firing into the shutdown. **Fix:** both calls added at the top of the before-quit handler, each in try/catch so partial shutdown can't block app exit.
- **Settings panel version footer rendered `"mnml "` (trailing space) before the IPC for `app.getVersion()` resolved.** **Fix:** conditional `version ? "mnml v..." : "mnml"`.

### Fixed — security (hardening)
- **`fetchTitle` would probe private-network URLs.** Copying `http://192.168.1.1/admin` caused mnml to fetch it and store the response title in clipboard history (SSRF-lite — user-triggered, but a real privacy / info-disclosure surface). **Fix:** new `isPrivateHostname()` guard at the top of `fetchTitle` AND inside the redirect-follow path so a public URL can't 302 us into the intranet. Blocks `localhost`, `*.local`, `127/8`, `10/8`, `192.168/16`, `172.16-31/x`, `169.254/16`, IPv6 `::1`, `fc00::/7`, `fe80::/10`.

### Internal
- `site/README.md` updated — describes the new brand mark + the `og-v2.png` cache-bust convention + the latest.yml deploy artefact layout.
- `.gitignore` covers `build/icon.png` — the intermediate file `make-icons.mjs` writes before each rename. Defensive; the script always cleans it up, but if interrupted this prevents accidental commit.
- All 7 findings from audit pass 5 closed. All 8 findings from the post-v0.2.37 manual bug-hunt closed. Codebase typecheck-clean.


## v0.2.37 — 2026-05-15

Update banner moves out of the footer's way + small cleanup pass.

### Fixed
- **Update banner overlapped the footer.** The banner was `position: absolute; bottom: 0` and laid on top of the "Click to paste · Shift-click to copy / Alt Alt to toggle" footer row, obscuring both. **Fix:** restructured CompactView's outer container to `relative h-full flex flex-col`. The inert (non-modal) subtree containing header / tabs / content is now `flex-1`. The UpdateBanner and footer became sibling flex children below it, sitting outside the `inert` wrapper so the banner's "Restart now" button stays clickable even while Settings is open. The banner returns `null` when idle and consumes no flex height; when active it pushes the content area up by its own row height (≈28 px) so both rows are fully visible.

### Internal
- `electron/main.ts`, `electron/ipc.ts`, `src/components/*` swept for `TODO` / `FIXME` / stray `console.*` — grep returned zero hits across both `src/` and `electron/` trees. The codebase has stayed clean across the recent flurry of changes.
- `UpdateBanner` no longer has `absolute bottom-0 left-0 right-0`; the new comment in `update-banner.tsx` explains why it's a regular flex child now.
- `app.tsx` no longer imports `UpdateBanner` (only the `UpdateState` type) — CompactView is the sole owner of the banner's render position. Update state still lives in app.tsx (so the `bridge.onUpdateAvailable` / `onUpdateDownloaded` listeners only register once) and is passed down as props.


## v0.2.36 — 2026-05-15

Four targeted polish items: bug-fix the update-check false positive, clear the search on hide, show the version + support contact in Settings, surface the support email on the landing site.

### Fixed
- **"Update ready" lied when no update existed.** The Settings → "Check now" button reported an available update every time, even when on the latest version. Root cause: `electron-updater`'s `checkForUpdates()` resolves with the server's latest version in `updateInfo.version` regardless of whether it's newer than what's installed, and the IPC handler was checking `!!updateInfo.version` (always truthy). **Fix:** switched the check to `!!r.downloadPromise`, which is the authoritative indicator — `downloadPromise` is only set when the server version actually exceeds the installed version and `autoDownload` kicks off a fetch.
- **Search query persisted between summons.** Type into the search → hit Esc / click outside → press Alt-Alt again → the previous query was still there. Surprising for the "fresh window every summon" mental model. **Fix:** CompactView now subscribes to `onVisibilityChanged`; when the window hides, `setQuery("")` clears the input. Tab selection is intentionally left alone (less destructive).

### Added
- **Version + support contact in Settings.** Tiny tabular-nums line at the bottom of the Settings sheet shows `mnml vX.Y.Z` on the left and `info@nxyz.art` (mailto link) on the right. Pulled fresh from `app.getVersion()` via a new `getVersion` IPC channel each time the sheet opens.
- **Support email surfaced on the landing site** in two places:
  - Install section: install-alt copy ends with "Questions or feedback: info@nxyz.art".
  - Footer: "MIT licensed · built for Windows · info@nxyz.art" (mailto link).

### Internal
- New IPC channel `mnml:app:version` (renderer-facing as `bridge.getVersion()`).


## v0.2.35 — 2026-05-15

Auto-launch on Windows login is now the default and self-healing. The hotkey is always live the moment you sign in.

### Changed
- **`launchOnStartup` defaults to `true`.** Was `false`. mnml is meant to be always-on — the double-Alt hotkey is useless if the app isn't running. New installs auto-register with Windows on first boot. Existing users who never touched the toggle pick up the new default on upgrade; users who explicitly toggled OFF keep their choice (the stored row overrides the default).
- **Site copy updates** — principle #2 is now "One hotkey, always live" and mentions auto-launch. The install section mentions it too.

### Added
- **`syncLoginItemWithSetting()` runs on every boot.** Compares the setting to the actual `HKEY_CURRENT_USER\…\Run` registry entry; if they disagree, corrects the registry to match. Recovers gracefully from:
  - Fresh install (default ON, registry not yet written)
  - External cleanup tools that removed the Run entry (CCleaner, Autoruns, Windows reset)
  - User explicit OFF that somehow didn't propagate to the registry
  - User explicit ON that somehow got cleared
  - Errors during sync are caught + logged; mnml keeps running even if the registry call fails.

### Notes
- v0.2.34 installs auto-update to v0.2.35 via the Vercel update channel.
- This means anyone on v0.2.34 who never opened Settings will start auto-launching with Windows after the update lands. To opt out: Settings > Launch on startup.


## v0.2.34 — 2026-05-15

Configurable storage folder. Point mnml at a Dropbox / OneDrive / iCloud folder to sync your clipboard history, snippets, and images across devices. One source of truth, no accounts, no cloud middleman.

### Added
- **Custom storage folder (Settings > Storage folder).** mnml's persistent data — SQLite database, saved snippets, clipboard image files — can now live in any local folder. Default stays at `%APPDATA%/mnml`; user picks an alternative via a native folder dialog. Pick a Dropbox / OneDrive / iCloud folder and your clipboard syncs across devices. Pick the same folder on a second machine and the install adopts the existing data instantly (cross-device handoff).
  - **Where the choice is stored**: `%APPDATA%/mnml/storage-location.json` (tiny pointer file). The chosen `dataDir` itself can't live in the SQLite because the SQLite IS in `dataDir` (chicken-and-egg). The pointer file is the only thing permanently anchored to the local machine.
  - **Migration**: when you pick a new folder, mnml closes the SQLite connection (WAL checkpoint + clean handle release), copies `mnml.sqlite` + `mnml.sqlite-wal` + `mnml.sqlite-shm` + the `images/` directory to the new location, persists the new pointer, then auto-restarts to pick up the new path. If the new folder is empty, your current data moves over; if it already has an `mnml.sqlite`, the existing data is adopted as canonical (your local data stays put as a backup at the previous path).
  - **Graceful failure**: if the configured folder later becomes unreachable (Dropbox folder unmounted, drive missing, permissions broken), mnml falls back to the default location with a warning logged. No data loss; remount the synced folder and the next launch picks it back up.
  - **One-instance-at-a-time guidance**: a hint under the setting tells users not to run mnml on two devices simultaneously against the same synced folder. SQLite + cloud-sync conflict files would corrupt the DB. Sequential use is fine.
- **`closeDb()` API** in `electron/db/index.ts` — clean shutdown of the SQLite connection (checkpoint + close). Used by the storage migration; available for future "graceful quit" flows.
- **`electron/db/data-dir.ts`** module — resolves the active data directory, handles the pointer file (read / write / clear), exports `setDataDir()` / `resetDataDir()` migration primitives with rollback-on-failure semantics.
- **Five new IPC channels**: `storage:get` (current state), `storage:pick` (native folder dialog), `storage:set` (migrate + restart), `storage:reset` (back to default + restart), `storage:reveal` (open the folder in Explorer).
- **Landing site: new "Sync" feature block.** Fourth block under "What's in it", uses a new `.tag-sync` (violet) feature pill.

### Internal
- The `getDb()` flow now always reads paths through `getDataDir()`. The DB file is still `mnml.sqlite`; the images dir is still `<dataDir>/images`. Just the parent path is variable.
- The Settings panel sheet got a full-width "Storage folder" section between Max-saved-items and Updates. Includes a click-to-reveal path display, "Choose folder…" button, and a "Reset to default" button (only shown when not on default).
- Search bar scopes its focus indicators via `[data-mnml-search-bar="true"]` so the wrapper's 1 px light-blue ring is the single signal — the input AND the clear-X button both opt out of the global 2 px outline.

### Notes
- v0.2.33 installs auto-update to v0.2.34 via the Vercel-hosted update channel introduced last release.
- v0.2.32 installs are still stranded (their auto-updater was pointed at the broken private-repo GitHub URL); manual re-download still required for those.


## v0.2.33 — 2026-05-15

Third audit pass: all 6 findings closed (1 high, 3 medium, 2 low) plus a UX tweak (the search-bar focus ring). Auto-updates now work again from the privately-published source; the installer ships with a Vercel-hosted update channel.

### Fixed
- **Auto-updater was silently broken for end users.** v0.2.32 installer's `electron-updater` was pointed at the (now-private) `syfpsy/mnml` GitHub Releases. Every daily check returned 404; the error was caught but never surfaced, so users would stop getting updates without knowing. **Fix:** switched `package.json` build.publish to the **generic** provider, URL `https://mnml-bay.vercel.app/`. The build now generates `latest.yml` + `mnml-setup.exe.blockmap` alongside the installer; all three artefacts are deployed to the website. Installed apps on v0.2.33+ check the same domain that served the download, no GitHub auth needed. Future releases: drop the three artefacts into `site/` and run `vercel --prod`. The repo stays private.
- **Renderer first-paint theme flash.** The root `index.html` had `class="dark"` hardcoded; users with `lightTheme: true` saw a brief dark flash before React's `useEffect` applied their preference. **Fix:** main process now reads `lightTheme` synchronously before `win.loadURL/loadFile` and passes it via a `?theme=light|dark` query param. An inline boot script in `index.html` reads the param and applies the class before first paint. No round-trip, no flash.
- **Content-Security-Policy split into per-directive rules.** Old CSP had `default-src 'self' 'unsafe-inline'` covering everything; `'unsafe-inline'` was over-applied because of inline `style={{ }}` attributes only. **Fix:** the policy is now per-directive — `script-src 'self' 'unsafe-inline'` (needed for the theme boot script), `style-src 'self' 'unsafe-inline'` (needed for inline JSX styles), `img-src` / `font-src` / `connect-src` unchanged. Cleaner intent, same security envelope.
- **`.exe` download served with `Content-Disposition: inline`.** Browsers downloaded anyway because of the MIME, but the contract was wrong. **Fix:** explicit `attachment; filename="mnml-setup.exe"` rule in `vercel.json` makes intent unambiguous.
- **`.exe` had no Cache-Control rule.** Default `max-age=0, must-revalidate` meant every visit re-revalidated the 81 MB file. **Fix:** explicit `public, max-age=86400, must-revalidate` rule. `latest.yml` gets a much shorter 60 s cache so update checks see new versions quickly. `.blockmap` gets the same 24 h cache as the .exe.
- **`useItems` had a stale `eslint-disable-next-line react-hooks/exhaustive-deps` directive.** The disable was no longer needed — `bridge` is module-level, `setItems` is stable from `useState`, and `enabled` is in the deps array. **Fix:** removed the disable.

### Changed
- **Search-bar focus ring is now 1 px, light blue.** New `--focus-search` token (sky-300 in dark mode, sky-600 in light mode for non-text 3:1 contrast against the warm cream bg). Replaces the generic `--border-focus` value on the SearchBar wrapper's `:focus-within` state. The input itself now opts out of the global 2 px outline (`input[data-mnml-search="true"]:focus-visible { outline: none; }`) so the two focus indicators don't stack. The demo widget on the landing site mirrors the same colour (the demo's search bar is permanently shown in its "focused" state).
- **Auto-updater rebuild required.** v0.2.32 installer cannot reach the new updater URL because its publish config is baked into the binary. v0.2.33 installer ships with the corrected URL. Users on v0.2.32 will need to re-download from the website (a one-time cost) to pick up the working updater; everyone from v0.2.33 forward gets auto-updates.

### Internal
- `electron/main.ts:631-642` — `win.loadURL/loadFile` calls now thread the theme query param through.
- `vercel.json` — three new header rules for `/mnml-setup.exe`, `/(latest|alpha|beta).yml`, `/(.*).blockmap`.
- `.gitignore` — added `site/mnml-setup.exe.blockmap` and `site/latest.yml` (deploy-only build artefacts).


## v0.2.32 — 2026-05-15

First public-website release. Audit passes 1 and 2 (21 findings) closed; landing site live at https://mnml-bay.vercel.app/ with a static `mnml-setup.exe` download served from the same origin. No new features; this is a UI polish + a11y + theming release.

### Fixed (second audit pass: all 8 findings closed)
- **`--accent-saved` repeated the same AA-fail pattern we fixed for `--accent-app` last cycle.** Light `#0284c7` on the tinted accent-bg landed at 3.1 : 1 (app) / 3.4 : 1 (site) — both below AA. Affected the "Save" submit button in the snippet-add form and the "Snippets" feature pill on the landing site. **Fix:** new `--accent-saved-text` token. Dark = `#38bdf8` (current), light = `#075985` (sky-800, ~5.6 : 1 on tinted bg). Repointed both usages.
- **Pre-emptively split `--accent-link-text` (`#5b21b6`) and `--accent-text-text` (`#1e3a8a`)** to standardise the pattern. Repointed `.tag-clipboard` on the site. App-side usages are graphical-only (icon tiles, selection rings); kept on the base accents. The system now has a clear rule: `--accent-*` for graphical surfaces (3 : 1 threshold), `--accent-*-text` for small-text overlays (4.5 : 1 threshold).
- **Settings modal wasn't truly modal.** `aria-modal="true"` was declared but tab order leaked into the search bar / tabs / list behind the scrim, and there was no autofocus on open. **Fix:** initial focus moves to the X close button via `useEffect` + ref. The non-modal subtree of `<CompactView>` gets `inert={settingsOpen}` so focus, pointer, and assistive-tech navigation can't escape the sheet. Browser support: Chrome 102+, Safari 15.5+, Firefox 112+ (well within Electron 33's Chromium 130).
- **Heading hierarchy started at `<h3>` in compact view.** `app-results-list` and `saved-list` declared `<h3>` for their section labels with no `<h1>` or `<h2>` above. **Fix:** demoted both to `<p>` with the existing class-based styling. Mirrors the same demote the demo widget on the site received in the previous audit pass.
- **OG image was SVG-only.** Twitter/X explicitly rejects SVG for cards, so the link rendered blank when shared there. **Fix:** generated `site/og.png` (1200 × 630, 71 KB, rasterised from `og.svg` via `npx sharp-cli`). Pointed `og:image` and the new `twitter:image` at the PNG. Added `og:image:width` / `:height` / `:alt` and `twitter:image:alt` meta tags. The SVG stays around for environments that prefer it.
- **Light `--bg-raised` drifted between app and site.** App was `#f0f0ec` (warm cream, anti-AI-slop), site was `#ffffff` (pure white, on the design-laws watchlist). **Fix:** site now mirrors the app at `#f0f0ec`. The demo widget in light mode now matches the actual product surface.
- **App `--accent-saved-bg` alpha drift.** App had `0.12`, site had `0.10`. **Fix:** app dropped to `0.10` to match.
- **Light `--t3` contrast comment overstated the margin.** Real measurement was 4.81 : 1 (claimed ~5.0). **Fix:** bumped from `#6c6c75` to `#69696f` in both files for an honest ~5.1 : 1.

### Fixed (first audit pass: all 13 findings closed)
- **`--accent-app` failed WCAG AA as text in light mode.** Light `#059669` had only ~3.2 : 1 against the tinted accent-bg, failing AA (4.5 : 1) for small text. Affected the principle numbers (`.principle-list .n`), the "Launcher" feature tag, and (via opacity blending) the download-button meta line. **Fix:** new `--accent-app-text` token. Same bright emerald (`#34d399`) in dark mode, darker emerald-700 (`#047857`, ~5.3 : 1 vs `--bg`, ~4.7 : 1 vs tinted bg) in light mode. Repointed the three text usages; left `--accent-app` for graphical uses (button bg, dot, glow) which only need 3 : 1.
- **Em dashes in user-visible site copy.** Five occurrences in hero/principles/features plus the page title and OG title. The absolute-bans list forbids em dashes everywhere a user sees them. Rewritten with colons, commas, semicolons, and period splits. The title is now "mnml: a keyboard-first clipboard for Windows".
- **Demo widget keyboard trap.** The faux preview in the hero contained six interactive `<button>` elements (clear-X + 5 category tabs) that were in the natural tab order and led to dead-ends. **Fix:** `inert` attribute on the wrapping `<aside class="demo">`. The whole subtree is now non-focusable and click-inert but still rendered and announceable. Stripped the misleading `role="tablist"` from the inner tab strip (the buttons inside don't have `role="tab"` / `aria-selected` / `aria-controls`, so the contract was broken anyway).
- **Heading hierarchy violation in the demo.** Two `<h3 class="section-h">` elements ("Saved", "Apps & Settings") appeared inside the hero `<aside>` before the page's first `<h2>`, breaking the h1 → h2 → h3 outline. **Fix:** demoted to `<p class="section-h">`. Styling is by class, so visuals are unchanged.
- **Settings toggle thumb animated `left` (a layout property).** Triggers reflow + paint on every frame instead of compositing. **Fix:** `transform: translateX(0 / 16px)` with an explicit `transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease`. Dropped the broad `transition-all` that was sweeping in `left`.
- **Settings toggle target size (32 × 18 px) below WCAG 2.5.8 minimum (24 × 24).** **Fix:** track bumped to 40 × 24, thumb 20 × 20, 2 px padding. Visually similar; meets AA target size.
- **Light `--t3` contrast was 4.57 : 1 (margin too thin against display variance).** **Fix:** bumped from `#76767a` (app) / `#6f6f78` (site) to `#6c6c75` in both files for a clean 5 : 1.
- **Light `--t2` bumped on app side** from `#5f5f66` to `#565660` for stronger secondary-text hierarchy (~6.9 : 1, up from ~5.5 : 1). Mirrors what the site already shipped.
- **`.btn-meta` opacity dropped from 0.72 to none.** Opacity-blending made effective contrast theme-sensitive (4.7 : 1 dark, 3.5 : 1 light). The size + weight contrast vs `.btn-label` already provides the visual hierarchy without dropping contrast.

### Changed
- **Theme toggle bumps to 40 × 40 on viewports ≤ 600 px** (was 34 × 34 everywhere). Above WCAG 2.5.8 baseline at both sizes; thumb-friendly on phones.
- **Site header `backdrop-filter` decision documented** in CSS as a deliberate single-use exception to the glassmorphism ban. Added an `@supports not (backdrop-filter)` fallback that ups the background opacity so the header stays readable when the blur isn't honoured.
- **Demoted legacy `docs/index.html` + `docs/screenshot.png`.** Pre-Vercel landing page from April; replaced by `site/`. Was already excluded from deploys via `.vercelignore`, but greppable / browsable. Kept `docs/bug-history.md` for institutional memory.
- **Landing site: download buttons are now static links to a local `mnml-setup.exe`.** The old flow fetched `api.github.com/repos/syfpsy/mnml/releases/latest` on page load and rewrote the buttons to point at the latest `.exe` asset, with a version + size + date meta line. That flow stopped working when the repo went private (the GitHub API returns 404 for unauthenticated requests). New flow: `<a href="mnml-setup.exe">` served from the same origin as the page. The site no longer talks to GitHub at all.
- **Landing site: removed every GitHub-repo link.** Header nav (GitHub, Releases), hero "View source" CTA, install-section "All releases" + "build from source" line, footer URL. The repo is private; advertising a 404 URL is worse than not linking. Header nav now hosts a single theme-toggle button.

### Added
- **Landing site: light theme + header toggle.** Full `html.light` token override mirroring the app's palette family — warm `#fafaf8` bg, calibrated `--t1/2/3` for AA, darker green primary accent (`#059669`) so dark text on the button still hits AAA. The toggle persists to `localStorage` under `mnml-theme`; if the user has never clicked it, the page follows `prefers-color-scheme` and updates live when the OS theme changes. Inline boot script sets the class before first paint so there's no flash of the wrong palette. Smooth 220 ms cross-theme transition on body / header / window / button.
- **`--bg-elevated`, `--border-strong`, `--accent-app-strong`** site tokens — one notch above the existing tokens, used for kbd pills, inline code, and the demo glow in light mode where the dark-mode `--accent-app-bg` was too faint against warm cream.
- **`--btn-primary-fg` token** (both app + site) — dark-text-on-green primary button colour. Was hardcoded `#0c1410` in the site button rule; now a token defined per-theme so the rule is theme-neutral.
- **App + site `input::placeholder` rule pinned to `--t3`.** Browser default was 50 % `currentColor`, which in light mode landed around 3 : 1 against the warm bg (below AA). `--t3` is calibrated 5 : 1 in both themes.

### Fixed
- **Site OG card no longer prints the GitHub URL.** Bottom-left of `og.svg` was "github.com/syfpsy/mnml" — broken link for everyone who isn't an authenticated collaborator. Replaced with the tagline "local · keyboard-first · MIT".

### Notes
- No new dependencies. Theme toggle is ~30 lines of vanilla JS.
- No production deploy from this change — the user said keep tweaking. The `vercel.json` + `.vercelignore` are unchanged.


## v0.2.31 — 2026-05-15

Audit fixes — every P1 / P2 / P3 finding from the v0.2.30 audit landed.

### Fixed
- **`--t3` text now meets WCAG AA contrast.** Dark `--t3` bumped from `#46464a` (≈ 2.0 : 1, fails AA) to `#7e7e85` (≈ 5.0 : 1). Light `--t3` bumped from `#b1b1b3` (≈ 2.0 : 1) to `#76767a` (≈ 4.6 : 1). `--t2` also re-tuned for stronger hierarchy: dark `#9494a0` (≈ 6.5 : 1), light `#5f5f66` (≈ 5.5 : 1). All hint text, timestamps, footer copy and snippet previews are now AA-readable on both themes.
- **Side-stripe selection indicators replaced with 1 px full inset rings.** The frontend-design absolute-bans rule forbids `border-left / border-right > 1 px as a coloured accent on list items`. `app-results-list`, `saved-list`, and `items-list` now use `boxShadow: "inset 0 0 0 1px <accent>"` — a full border around the selected row, not a side stripe. The category accent (text/link/image for clipboard, app/saved for the other lists) is the ring colour.
- **`button:focus-visible` / `input:focus-visible` global rule** added to `styles.css`. Tailwind preflight had removed all default outlines, leaving every Settings button and the search clear button keyboard-invisible. The new rule applies a 2 px `--border-focus` outline with 2 px offset to every button, input, and textarea — only when focused via keyboard.
- **`ItemsList` now uses correct ARIA semantics.** Was `role="grid"` + `role="row"` (which expects `gridcell` children — we had none). Switched to `role="listbox"` + `role="option"`, matching the sibling `AppResultsList` and `SavedList` components. `compact-view`'s focus helpers updated to query `[role="listbox"]` / `[role="option"]` instead of the old `[role="grid"]` / `[data-slot="list-view-item"]` selectors.
- **Toggle thumb is themed.** Was hardcoded `#0e0f12` (the dark-mode background hex) so in light mode the thumb showed a dark-on-green smudge. Now uses `var(--bg)` and themes correctly.

### Added
- **Themed colour tokens for clipboard categories.** `--accent-text / -bg / -row / -row-hover`, same families for `--accent-link` and `--accent-image`. Per-type tints in `items-list` are now tokens with light-mode overrides instead of inline rgba constants.
- **Themed status tokens for the update banner.** `--accent-info` / `--accent-info-bg` / `--accent-info-border` for the downloading state, `--accent-success` family + `--accent-success-btn` for ready. Banner now reads correctly on light mode (was hardcoded for dark).
- **`--accent-highlight-bg`** — search-match `<mark>` background, themed (was hardcoded amber).
- **`--scrim`** and **`--elevation-2`** tokens — themed modal dim + shadow. Dark mode keeps the heavy treatment; light mode lightens both so Settings doesn't smudge against the warm bg.
- **`.mnml-btn-ghost`** CSS class — single rule that handles colour-on-hover for ghost icon buttons. Replaces ~9 sites of inline `onMouseEnter`/`onMouseLeave` JavaScript handlers (`IconBtn`, `TabBtn`, snippet add/cancel/delete, settings close, settings clear-history, search-bar clear, etc.).
- **`.mnml-numinput`** CSS class — hides the native `<input type="number">` up/down spinners (Webkit + Firefox) so the Max-saved-items field matches the rest of the design system.
- **Tab strip ARIA**: `role="tablist"` on the container, `role="tab"` / `aria-selected` / `aria-controls` on each button, `role="tabpanel"` + `aria-labelledby` on the content region. Keyboard tab-management now uses the standard `tabIndex={0}` only on the active tab pattern.
- **`role="dialog"` + `aria-modal` + `aria-labelledby`** on the Settings sheet. Sheet title is now an `<h2>` instead of a `<span>`.

### Changed
- **Action button hit targets raised from ~22 × 22 → ~26 × 26 px** (WCAG 2.5.8). All ghost icon buttons in `items-list` and `saved-list` now use `p-1.5` padding instead of `p-1`.
- **`--item-selected` dropped to 10 % overlay** (was 14 %). With the new 1 px accent ring as the WCAG state indicator, the bg tint's job is reduced to "soft reinforcement" — the ring is what carries the contrast.

### Notes
- The summon-rules guard (`npm run check:summon`) still passes — focus/activation/flicker code is untouched.
- All 14 audit findings (4 × P1, 6 × P2, 4 × P3) addressed. Sweep cleared zero false-positive references on the way out: no remaining `data-slot="list-view-item"`, no remaining inline hover handlers setting `style.color`, no remaining hardcoded hex / rgba colours in component JSX outside of comments.


## v0.2.30 — 2026-05-14

### Fixed
- **Auto-paste now lands on the right window.** Old flow: blur mnml → hide → wait 300 ms → SendKeys "^v". Problem: Windows could promote *any* visible window in z-order when mnml hid (often Explorer or an always-on-top tool), and the Ctrl+V landed there. New flow:
  1. The native foreground helper now captures and reports the HWND that owned foreground focus *before* the summon, via a new `prev <hwnd>` output line. `main.ts` stores it in `prevForegroundHwnd`.
  2. The helper gained a `restore <hwnd>` command that runs the same synthetic-Alt + `SetForegroundWindow` dance, but on an *external* HWND.
  3. On hide-with-paste: hide mnml → ask the helper to restore the captured HWND → 150 ms settle → synthesize Ctrl+V.
  Result: Ctrl+V reliably lands in the app the user summoned mnml from.
- **`triggerPaste` uses `uIOhook.keyTap(V, [Ctrl])`** (in-process `SendInput`) instead of spawning `wscript` to run a VBScript SendKeys file. No subprocess per paste, no `paste.vbs` on disk. The VBS path is retained as a fallback if `uIOhook.keyTap` throws.

### Added
- **`npm run release` script.** Replaces the old `build:publish` to match the rest of the pipeline (`check:summon` → `bump-version` → `tsc -b` → `vite build` → `electron-builder --publish always`). One command, with `GH_TOKEN` in the env, builds + uploads the installer + `latest.yml` to GitHub Releases under `syfpsy/mnml`. Subsequent app launches detect the new release via electron-updater's GitHub provider and download in the background.
- **"Check for updates" button in Settings.** A new row under Max-saved-items: tap "Check now" to trigger `autoUpdater.checkForUpdates()` on demand. Shows "Up to date" / "Update ready" / "Check failed" inline. The 24 h periodic check still runs in the background; this is just for impatient users.
- **`mnml:window:check-update` IPC channel** + `bridge.checkUpdate()`. Returns `{ ok, available?, version?, message? }`.


## v0.2.29 — 2026-05-14

Lean strip: dropped every dependency that wasn't carrying its weight. Renderer JS bundle is now **228 KB** (down from 474 KB — 52 % smaller). No feature regressions; same UX, fewer moving parts.

### Removed
- **`@heroui-pro/react` + `@heroui/react` + `@heroui/styles`.** The three were imported for exactly three widgets: `ListView`, `Switch`, `NumberField`. All replaced with plain HTML — ~120 lines total. The CSS imports at the top of `styles.css` and the `.list-view__*` override rules are gone. `Tab` strip and `SearchBar` were already plain.
- **`react-aria-components`** — only a single `Key` type import. Replaced with inline `string`.
- **`@number-flow/react`, `embla-carousel`, `embla-carousel-react`, `motion`, `recharts`, `react-resizable-panels`, `tailwind-variants`, `tailwind-merge`** — entirely unused devDeps from earlier scaffolding. Dropped.
- **Trigram fuzzy-match cache in `electron/search/service.ts`.** With the items table capped at 200 rows, the in-memory cache rebuild was wasted work. Replaced with FTS5 BM25 → LIKE fallback. Stateless: no `dirty` flag, no `rebuildCache()`, no in-memory `Set<string>` per row.
- **`markIndexDirty()` plumbing.** Was only invalidating the trigram cache. All callers in `clipboard/monitor.ts` and `electron/ipc.ts` simplified.
- **`trigrams()` and `trigramSim()` from `electron/search/tokenize.ts`.** Only `normalize()` and `escapeFtsQuery()` are still needed.

### Changed
- **`ItemsList` is plain `<div role="grid">` with managed focus.** Same `[role="grid"]` + `[data-slot="list-view-item"]` selectors so `compact-view`'s `focusList()` / `isClipboardEndActive()` helpers keep working. Internal `focusedIndex` state replaces the old aria-grid composite. Mouse hover uses CSS `:hover` (single rule in `styles.css`); keyboard navigation uses Arrow/Home/End/Enter on the grid container.
- **`Switch` and `NumberField` in Settings** are now ~40-line plain components (`<button role="switch">` + `<input type="number">`). Identical UX; uses our token palette directly.
- **Search service is stateless.** Every query: FTS5 BM25 first (already sorted by `pinned, bm25 ASC, updated_at`), `LIKE %query%` fallback if FTS yields nothing (cheap at ≤200 rows). No in-memory state to grow, invalidate, or rebuild.
- **Auto-updater interval raised 4 h → 24 h.** Hourly network round-trips were not finding anything useful between checks.

### Notes
- The renderer bundle was 474 KB before this pass and is **228 KB** after. Faster first paint, smaller install footprint, less memory.
- The summon-rules guard (`scripts/check-window-summon-rules.mjs`) still passes — focus/activation/flicker code is untouched.


## v0.2.28 — 2026-05-12

Memory / responsiveness pass. Earlier builds grew sluggish after long sessions; six progressive-allocation paths are now bounded.

### Fixed
- **Clipboard image polling no longer re-encodes the bitmap every 500 ms.** When an image sat on the clipboard, `clipboard.readImage().toPNG()` was running on every poll — for a 4 K screenshot that's several MB of allocation churn per second. Now the poll uses `getSize()` as a cheap fingerprint and only runs the full PNG hash when either the dimensions changed or it has been > 4 s since the last confirmation. Worst case: a new image with identical dimensions to the previous one is captured up to 4 s late.
- **`getImage` IPC returns a 96 px thumbnail instead of the full PNG.** The renderer was caching full-resolution screenshots as base64 strings in React state — a 25-item history of 4 K screenshots pinned ~100 MB in the DOM. The main process now resizes via `nativeImage.resize()` and LRU-caches the encoded thumbnail by item id (cap 64). The compact view shows these at 24 px, so 96 px is plenty of overhead for theming / zoom.
- **`iconCache` in `app-search.ts` is now LRU-bounded** at 256 entries. Previously unbounded — every unique app or setting whose icon was ever requested stayed in memory forever. Touch-on-hit semantics keep the hot set warm; oldest entries are evicted when the cap is hit. Also switched `app.getFileIcon()` from `size: "normal"` → `size: "small"` (24 px native instead of 32 px) to halve the per-icon byte cost.
- **Auto-updater `setInterval` handle is stored and cleared on `before-quit`.** The interval ran every 4 h forever; the handle was never captured, so the closure over `check` could not be released by GC. Trivial leak in practice (one interval), but it's correct now.
- **Foreground-helper stdout buffer is capped at 16 KB.** The helper emits one short line per request, but a hung PowerShell could in principle dump a long backtrace without a newline; the accumulator would grow without bound and pin live memory in the closure. Overflow now truncates to the last 1 KB and logs a notice.
- **`listSaved()` is hard-capped at 500 most-recent rows.** Defensive — even on a runaway script that inserts thousands of snippets, the renderer never receives more than 500 at a time.


## v0.2.27 — 2026-05-03

Single-window simplification. mnml is now one 440×540 window with category tabs at the top — no more compact / expanded toggle.

### Removed
- **Expanded view.** `src/components/expanded-view.tsx` is deleted. The `ExpandedView` component, the expand/compact toggle button in the header, the `ExpandIcon` and `CompactIcon` SVGs, the `applyTheme(light)` cross-view sync — all gone.
- **`windowMode` setting.** Dropped from `AppSettings` (both renderer and main types), removed from `DEFAULTS`, `getAll()`, and the localStorage `LS_KEY` shim in `app.tsx`. The persisted `windowMode` row in existing DBs is harmless — it's never read again.
- **`mnml:window:mode` IPC channel** and the `setMode` handler. The `WindowMode` type alias from `electron/ipc-channels.ts` is gone too.
- **Dynamic window sizing in `electron/main.ts`.** `EXPANDED_SIZE` and `currentMode` are deleted; the constant is now `WINDOW_SIZE = { width: 440, height: 540 }`. The `setMode()` function (resize + position-clamp dance) is gone.
- **Bridge & preload `setMode`.** `bridge.setMode` and `window.mnml.setMode` are removed.

### Changed
- **Tabs are now in the single window.** `All / Text / Links / Images / Saved` tab strip lives directly under the search bar, replacing what used to be the expanded-view-only tabs and the compact-view's inline "Snippets" section. Same per-tab behaviour as the old expanded view: clipboard-type tabs filter `useItems` by type; the Saved tab swaps the search-bar placeholder ("Filter snippets…"), filters via `useSaved(query)`, and renders `<SavedList>` full-width.
- **App + Settings results show below the active clipboard tab whenever a query is non-empty.** Skipped on the Saved tab (where the search bar means "filter snippets"). The `useAppSearch(isSavedTab ? "" : query)` short-circuit avoids wasted IPC calls.
- **Tab strip styling**: `text-[11px]` and `px-2.5 py-1` to fit comfortably in the narrow window. Active tab gets `var(--item-active)` background + bottom border accent, mirroring the old expanded view's styling.
- **`app.tsx` is much smaller.** No `Mode` type, no `useState(mode)`, no `LS_KEY`, no `switchMode`. Just renders `<CompactView onThemeChange={applyTheme} />` directly. The renderer-side backup focus, ESC-to-hide, and update-banner subscriptions are unchanged.

### Fixed
- **"No matches" shown above app results.** When the user typed a query that matched no clipboard items but did match an app or setting, the empty state ("No matches / Try different words") was rendering above the app results — misleading. Re-added the `showClipboardList` guard from earlier compact-view versions: clipboard list hidden when `items.length === 0 && query.trim() && (appResults.length > 0 || appSearch.isSearching)`.

### Notes
- The summon-rules guard (`scripts/check-window-summon-rules.mjs`) still passes — none of the focus / activation / flicker rules were affected by the strip.
- v0.2.26 was a build-only intermediate; this entry consolidates the changes.


## v0.2.25 — 2026-05-03

Bug-hunt cleanup pass after v0.2.24's strip+snippets refactor.

### Fixed
- **Stale `pc-indexer-worker.mjs` and `preload.mjs` were left in `dist-electron/`** by Vite's previous-build cache; rebuild was bundling them into the installer despite the source being deleted. Cleaned + rebuilt; final `dist-electron/` contains only `main.js` + `preload.cjs`.
- **Wasted IPC call on the Saved tab.** `useAppSearch(query)` was running unconditionally in `expanded-view`. Now it short-circuits with an empty query when the Saved tab is active so the worker-less app launcher doesn't compute results that would be hidden.

### Removed
- **Dead `[data-mnml-chip]:focus-visible` selector** from `styles.css` — the drive opt-out chips that used it were removed in v0.2.24, so nothing matched.
- **Unused `BookmarkFilledIcon`** from `icons.tsx`. Only the outline `BookmarkIcon` is referenced.
- **Stale `--accent-pc` reference** in a comment in `styles.css` (the token itself is gone since v0.2.24).


## v0.2.24 — 2026-05-03

Major simplification: the heavyweight PC-file indexer is gone. Search now covers Start-Menu apps and Windows Settings only. New "Saved snippets" feature lets you keep reusable text for one-click paste.

### Removed
- **Bulk PC-file indexer.** The `utilityProcess` worker (`pc-indexer-worker.ts`), the chokidar watcher (`pc-watcher.ts`), the SQLite tables (`pc_entries`, `pc_entries_fts`, `pc_index_meta`), the dashboard, the drive opt-out chips, the master toggle, and `pcIndexEnabled` / `pcIndexedDrives` settings — all gone. A migration in `electron/db/index.ts` drops the deprecated tables on first run, freeing disk space.
- **`chokidar` and `readdirp` dependencies.** Removed from `package.json` and `copy-native-deps.mjs`.
- **The third Vite Electron entry.** `vite.config.ts` is back to `simple({ main, preload, renderer })` only.

### Changed
- **App launcher (`pc-search.ts` → `app-search.ts`).** The launcher is now a tiny in-memory module that holds `~hundreds` of Start-Menu shortcuts plus the curated `WINDOWS_SHORTCUTS` list. No SQLite, no worker, no filesystem watching. Built once at startup; search is a synchronous fuzzy match. Renamed type `PcResult` → `AppResult` (`target` field replaces `path`); IPC channels `mnml:pc:*` → `mnml:app:*`; bridge `pcSearch` / `pcLaunch` → `appSearch` / `appLaunch`; component `PcResultsList` → `AppResultsList`; hook `usePcSearch` → `useAppSearch`. CSS token `--accent-pc` → `--accent-app`.
- **Settings panel reverted to its essential form.** No dashboard, no drive picker, no master switch — just the original toggles + max-items + clear history.
- **Expanded view "Files & Apps" tab is gone.** The tab list is now `All / Text / Links / Images / Saved`. Apps + Settings results show inline alongside any clipboard-tab search results.
- **First-paint window background mirrors the renderer's `--bg`** unchanged from v0.2.21 — the tinted neutrals are preserved.

### Added
- **Windows Settings + classic system tools in the launcher.** `electron/search/windows-settings.ts` defines a curated list of ~80 entries: every common `ms-settings:` page (Bluetooth, Wi-Fi, Display, Sound, Personalization, Update, Privacy, Accessibility, …) plus classic utilities (Task Manager, Device Manager, Registry Editor, Services, PowerShell, …). Each entry has a name + aliases for fuzzy matching. Launching: `ms-settings:` URIs go through `shell.openExternal`; bare command names use `start "" <cmd>` so the shell resolves PATH and registered handlers (mmc for `.msc`, control for `.cpl`).
- **Saved snippets.** New `saved_snippets` SQLite table + `electron/db/saved.ts` CRUD module. Snippets are user-curated reusable text — independent of clipboard history. CRUD over IPC: `savedList`, `savedAdd`, `savedUpdate`, `savedRemove`, `savedRestore`, `savedFromItem`. Activating a snippet copies its content + auto-pastes (same UX as a clipboard restore). Compact view shows a "Snippets" section with an inline `+` add form (label + content textarea, Ctrl+Enter to save). Expanded view has a dedicated "Saved" tab. Each clipboard row gets a hover bookmark button for one-click save-as-snippet (uses `defaultLabel` to derive a label from the first line). Two-click delete confirmation matches the existing pattern.
- **`--accent-saved` token** (sky-blue) — distinct from `--accent-app` (emerald) so the two sections never read as the same kind of thing. Per-theme overrides for AAA contrast.
- **`PlusIcon`, `BookmarkIcon`, `BookmarkFilledIcon`** SVG icons.
- **`onSavedChanged` IPC event** broadcast whenever a snippet is added/updated/deleted/touched — `useSaved` subscribes for live refresh across windows.

### Migration notes
- Existing PC-file index rows (potentially hundreds of MB on machines that ran v0.2.16–v0.2.22) are dropped automatically on first launch via `DROP TABLE IF EXISTS pc_entries`/`pc_entries_fts`/`pc_index_meta` in `migrate()`. The settings keys `pcIndexEnabled` and `pcIndexedDrives` are simply ignored — no harm in leaving the rows behind, they're never read again.


## v0.2.22 — 2026-05-03

Emergency performance fixes — earlier versions could noticeably slow the host system while indexing. None of the PC-search functionality is removed; it is now lighter by default and instantly disable-able from Settings.

### Added
- **Master "PC search" toggle in Settings.** When off, the bulk crawler, the chokidar watcher, and the Start-Menu seed are all skipped. Existing index rows still answer queries, but the index does not grow or refresh until the toggle goes back on. Dashboard shows "Off"; the Rebuild button is disabled. The toggle takes effect immediately — flipping off kills any in-flight worker and closes the watcher; flipping on re-seeds apps and re-attaches the watcher (the next search or a manual Rebuild kicks off a refresh).
- **Worker disk throttle.** The bulk crawler now sleeps 30 ms every 1 000 scanned entries (`THROTTLE_PAUSE_MS` / `THROTTLE_EVERY` in `pc-indexer-worker.ts`). The sync I/O loop is otherwise too aggressive and can saturate the disk queue, making every other app on the system feel sluggish for the duration of the crawl. Adds ≈ 3 % to wall-clock time; restores foreground responsiveness.

### Changed
- **`awaitWriteFinish` disabled in chokidar.** The previous setting (`stabilityThreshold: 200, pollInterval: 100`) installed a 100 ms-interval timer per active file change. On a machine where OneDrive sync or a downloader was actively writing, this kept chokidar's timer queue running constantly. Trade-off: an in-progress download is briefly indexed at its current partial size, then re-upserted by the next event when writing finishes.
- **Watcher scope narrowed to Desktop / Documents / Downloads.** Removed `OneDrive`, `Pictures`, `Videos`, `Music` from the default watch paths — they generate near-constant event traffic from sync clients and screen recorders. The 24-hour crawl still picks them up.
- **Auto-refresh interval raised from 1 hour to 24 hours.** The watcher catches user-folder edits in real time, so the bulk re-crawl is mostly catching up on other drives. Hourly was overkill; once a day is enough for long-running sessions.

### Notes
- Default for `pcIndexEnabled` is `true` so existing users don't lose the feature on upgrade. Users who feel any slowdown can flip the toggle off in Settings as the immediate escape hatch.
- All previous CHANGELOG entries describing chokidar's `awaitWriteFinish` window and its 1-hour refresh cycle are now historical — the current behaviour is documented above.


## v0.2.21 — 2026-05-02

Quality / accessibility pass on the PC-search surfaces (P1–P3 from the in-repo audit). All visible behaviour preserved; nothing semantic changed.

### Changed
- **Selection contrast meets WCAG 1.4.11.** Selected rows in the PC results list now combine `var(--item-selected)` (≈ 14 % overlay) with a 2 px emerald `var(--accent-pc)` left stripe — the stripe alone gives ≈ 10:1 contrast against the dark bg, well over the 3:1 floor for state indicators. The previous `var(--item-hover)` (4.5 % overlay) was effectively invisible.
- **Listbox + drive chips show a visible focus ring on keyboard tab.** New `[data-mnml-listbox]:focus-visible` and `[data-mnml-chip]:focus-visible` rules in `styles.css` apply a 2 px outline using `var(--border-focus)` (bumped from 22 % → 38 % opacity in dark, 25 % → 40 % in light to clear 3:1 against the bg). Mouse interaction still suppresses the ring (browser `:focus-visible` heuristic).
- **Drive chips floor at 28 px.** Per WCAG 2.5.8 (24×24 minimum). The indicator dot grows to 14 px and uses `var(--accent-pc)` when checked (previously a 12 px box that disappeared when unchecked).
- **Mouse hover no longer fights keyboard nav in the PC results list.** A 250 ms grace window after any keydown suppresses `mouseenter`-driven focus changes.
- **Tinted neutrals.** `--bg` is now `#0e0f12` (cool-tinted dark) and `#fafaf8` (warm-tinted light), replacing pure `#111111` / `#ffffff`. `windowBackgroundColor()` in `electron/main.ts` mirrors the new values to keep first-paint flash-free.
- **Segoe UI Variable Display** replaces Inter as the body font. Windows-first, distinctive, and not in the "AI slop" DON'T list.
- **Index dashboard distilled.** The 4-tile metric grid (Total / Files / Folders / Apps) is now a single primary count + breakdown line. Same information, less template.
- **`statusLabel()` is drives-aware.** Reads "Indexing 2 of 3 drives" instead of "Indexing whole PC" when the user has opted any drive out.
- **`<h3>` for the "Files & Apps" section heading** (was `<div>`). Same visual styling, real semantics.
- **Tokenised semantic accents.** `--accent-pc`, `--accent-pc-bg`, `--accent-danger`, `--accent-danger-bg`, `--accent-pinned` now centralise the previously hard-coded `#34d399`, `#ef4444`, `#f59e0b` literals in `pc-results-list.tsx`, `settings-panel.tsx`, and `items-list.tsx`. Per-theme overrides for `accent-pc` and `accent-danger` (slightly darker shades in light mode for AAA contrast).

### Added
- **`aria-live="polite"`** on the index-progress region of the Settings dashboard so screen readers track ticking counts and the current-path. `aria-busy` reflects the running state. The error message uses `role="alert"` for assertive announcement.

### Fixed
- **Hooks-order violation in `PcResultsList`** — `useRef` was added but landed below an early `return null`. Moved above the early return.
- **Unused `useMemo` in `PcDriveOptOut`** — removed (and its now-unused import). The `status?.mountedDrives` reference was a fresh array on every poll, so the cache always missed; the underlying work is trivial enough to do inline.


## v0.2.19 — 2026-05-02

### Added
- **Apps-instant on first launch.** A synchronous Start-Menu sweep runs once at startup and writes app rows to `pc_entries` before the bulk worker spawns. The very first summon already finds every installed app — no waiting for the file crawl to finish. Idempotent: the worker re-upserts the same rows during its own shortcut scan, so `deleteStaleRows()` cannot accidentally remove them.
- **Drive opt-out controls in Settings.** A new "Drives to index" section renders a chip for each currently-mounted drive; toggling a chip excludes that drive from the next rebuild. The setting (`pcIndexedDrives`) stores `null` when every mounted drive is included (the default) and an explicit allow-list once the user opts any drive out — re-enabling every drive collapses back to `null`, so a USB drive plugged in later is auto-included by default.
- **`PcIndexStatus.mountedDrives`** — new field exposed via the existing IPC channel. Drives the indexer status dashboard and the drive opt-out picker.

### Changed
- **Indexer pauses while the window is visible.** Summon now sends `{type:"pause"}` to the worker; hide sends `{type:"resume"}` (after a 500 ms grace window for the auto-paste tail). The worker checks the flag at every directory pop, so summon stays snappy even when a large drive is mid-crawl.
- **Drive scope respects the opt-out setting.** `driveRoots()` filters mounted drives by `pcIndexedDrives`. The worker receives the filtered list in its `start` message; rows from excluded drives are pruned by the next `deleteStaleRows()` because nothing in this scan touched them.

### Fixed
- Removed an unused `setSetting` import in `electron/main.ts`.


## v0.2.18 — 2026-05-02

### Changed
- **Bulk PC-search indexing now runs in a separate utility process.** The crawler used to share Electron's main thread with the IPC pipe, the global hotkey, and the renderer; long sweeps of large drives could measurably hitch the search box and the double-Alt summon path. The crawl now lives in `dist-electron/pc-indexer-worker.mjs`, spawned via `utilityProcess.fork()`. The worker has its own `better-sqlite3` connection (WAL mode handles concurrency with the main process's reader connection and the chokidar watcher's writes). Status is streamed back via `MessagePort`; `pc_index_meta` is updated each progress tick so a crash mid-scan still leaves the Settings dashboard sensible. Worker cleanup is wired into `before-quit` so the crawler does not outlive the parent process.
- **Sync I/O on the worker side.** Now that filesystem traversal runs in its own OS process, it uses `readdirSync` + `statSync` instead of the async equivalents — fewer microtask hops, faster directory walks. The main process no longer cares because it isn't doing the work.
- **Skip lists are mirrored, not shared.** The worker bundle keeps its own copy of the anywhere-name and drive-root skip lists rather than importing from `pc-search.ts`. Trade-off: a few dozen lines of duplication for a clean process boundary and a tiny worker bundle (~6 KB).
- **Vite now produces three Electron entries** (`main.js`, `preload.cjs`, `pc-indexer-worker.mjs`) using a second `vite-plugin-electron` invocation alongside the `simple` wrapper. `emptyOutDir: false` on the third entry prevents it from wiping the first two.


## v0.2.17 — 2026-05-01

### Added
- **Live PC-search index updates for user folders** — `Desktop`, `Documents`, `Downloads`, `OneDrive`, `Pictures`, `Videos`, and `Music` are now watched via `chokidar`. Files you create, rename, modify, or delete are reflected in search within ~200 ms (the `awaitWriteFinish` stability window) — no manual rebuild, no waiting for the next hourly crawl. Other drives still rely on the periodic full rebuild because watching `C:\` recursively overflows Windows' `ReadDirectoryChangesW` kernel buffer when an installer or zip extract bursts events. The watcher mirrors the bulk crawler's anywhere-name skip list (`node_modules`, `.git`, `.next`, build/cache directories, etc.) so it doesn't churn on dependency trees. `.lnk` files are ignored — the Start-Menu shortcut scan owns app discovery. Crash-safe: a missed event leaves a stale row, which the next full rebuild deletes via the existing `updated_at < scanStartedAt` purge.


## v0.2.16 — 2026-05-01

### Changed
- **PC search indexing is dramatically faster.** Three independent wins land together:
  1. **Aggressive skip list.** Drive-root system folders (`Windows`, `Program Files`, `Program Files (x86)`, `ProgramData`, `$Recycle.Bin`, `System Volume Information`, `PerfLogs`, `Recovery`, `MSOCache`, `Intel`, `AMD`, `NVIDIA`, etc.) are skipped only when they are direct children of a drive root, so a project folder named `windows-helpers` is still indexed. Per-user `AppData` is skipped entirely (apps continue to surface from Start-Menu shortcut scanning). Anywhere-name skips: `node_modules`, `.git`, `.svn`, `.hg`, `__pycache__`, `cache`, `.cache`, `.next`, `.nuxt`, `.gradle`, `.venv`, `venv`, `target`, `.idea`, `.vs`, `.turbo`, `.parcel-cache`, `.vite`, `.vercel`, `.wrangler`. Net effect on a typical Windows install: 60–80 % fewer entries to walk.
  2. **One syscall per file, zero per folder.** Each entry's type (file / folder / symlink / junction) now comes from the `Dirent` returned by `readdir({ withFileTypes: true })` — no separate `lstat` call. Folders no longer call `stat` at all (mtime is unused for folder ranking). Files still get a single `stat` for `mtime`. This roughly halves total syscall count on the walk.
  3. **Skip rebuild on startup when the index is fresh.** The persisted index is now consulted via `isPcIndexFresh()` (which reads `pc_index_meta.lastFinishedAt` and verifies the table is non-empty). If the most recent finish is younger than the 1-hour refresh window, the startup rebuild is suppressed. The next search after the window expires triggers a refresh as before. Rebuild button in Settings is unaffected.
- **Result ranking now sorts by relevance first, recency second.** An exact-name match always beats a contains-match regardless of file mtime; mtime is the tie-breaker. Previously a brand-new file that loosely contained the query could outrank an exactly-named file from last week.
- **Larger upsert batches and less frequent yields** (2 000 / 5 000 vs. 500 / 500). Reduces SQLite transaction overhead and event-loop ping-pong without making the main process noticeably less responsive.


## v0.2.15 - 2026-05-01

### Fixed
- Added native Windows foreground activation for double-Alt summon so keyboard focus reaches the search input, not just Chromium DOM focus.
- Removed the transparent rounded outer gap that exposed the opaque native window background as a black border/card.
- Stopped native focus activation from recursively triggering the double-Alt hotkey by adding detector cooldown, one-shot foreground activation, and a repeat-toggle guard.
- Made summon focus verification require both `document.hasFocus()` and the search input as the active element, then refocuses again after native/window focus is actually granted.

### Added
- Extended `npm run check:summon` to guard the native focus helper, verified search focus, and opaque-window renderer background rules.


## v0.2.14 - 2026-05-01

### Fixed
- Added one-per-summon focus logging so the main-process search focus pass can be verified from the runtime log.


## v0.2.13 - 2026-05-01

### Changed
- Summon/focus is now owned by the main process: after native `win.show()`, Electron directly focuses the window and executes a DOM focus pass on the search input.
- Double-Alt toggling now waits briefly after the Alt key-up before showing the window, so Windows can settle keyboard focus first.
- The window is now opaque instead of transparent to avoid first-summon compositor flashes on Windows.

### Added
- Build-time summon rules via `npm run check:summon`; release builds fail if flash-prone transparent/opacity patterns or the main-process search-focus pass are removed.


## v0.2.12 - 2026-05-01

### Fixed
- PC search FTS content now rebuilds during migration so existing indexes do not trip malformed FTS errors.


## v0.2.11 - 2026-05-01

### Changed
- Files & Apps indexing now crawls all ready local drive letters instead of only common user folders.
- PC search now uses a SQLite FTS index for database-backed whole-PC lookups.
- Settings now includes a PC search index dashboard with counts, drive scope, progress, errors, and a rebuild action.

### Fixed
- Removed the opacity-based summon path that was causing a visible flash.
- Search focus retries now continue briefly after summon instead of stopping at the first DOM focus attempt.


## v0.2.10 - 2026-05-01

### Changed
- Files & Apps results now carry filesystem modified timestamps and sort newest modified results first.
- Summoning now shows/focuses the native window before asking the renderer to focus the search bar, with short retries for Windows foreground timing.

### Fixed
- Reduced summon flicker by keeping the window transparent while bounds and focus settle.


## v0.2.9 - 2026-05-01

### Changed
- **Files & Apps search now uses a local SQLite index** built before querying, covering apps, common user folders, and OneDrive folders without calling Windows Search live.
- PC search requests now hit the local database through one IPC path, removing the slow Windows Search timeout/backoff state.

### Fixed
- Removed the "Windows search is slow now" result state from the UI.

## v0.2.8 — 2026-04-30

### Added
- **Files & Apps search** in compact view, powered by Start Menu/Desktop shortcut indexing and the Windows Search index.
- **Files & Apps tab** in expanded view for focused app/file lookup.

### Changed
- PC search now reports slow Windows Search separately from true empty results, so app results can still show quickly.
- Search input metadata now adapts to clipboard search vs. files/apps search while preserving global auto-focus.

## v0.2.7 — 2026-04-30

### Fixed
- **Keyboard input now works immediately after summoning the window.** The opacity-0 / `showInactive()` approach kept the HWND permanently "shown" in the OS window stack, so `SetForegroundWindow` was silently rejected (Windows blocks focus-steal to already-visible windows). The window is now truly hidden (`win.hide()`) after every dismiss and shown with `win.show()` on each summon. Windows unconditionally grants foreground activation on a hidden→shown transition, so the search bar receives keyboard input the moment the window appears — no click required.


## v0.2.6 — 2026-04-30

### Fixed
- **Search bar now reliably auto-focuses** when the window appears. The previous approach called `win.focus()` which Windows silently ignores for background processes (focus-steal prevention). Fixed with two changes: the main process now calls `app.focus({ steal: true })` to explicitly request foreground activation, and the renderer adds a `window "focus"` event listener as a fallback that fires the input focus the instant the OS hands focus to Electron — instead of relying solely on a fixed 80 ms delay that could fire before focus arrived.


## v0.2.5 — 2026-04-30

### Fixed
- **Image files now deleted from disk** when items are removed manually, pruned by the max-items limit, or wiped via "Clear history". Previously only the DB row was removed and PNG files accumulated indefinitely.
- **Escape in Settings no longer hides the window** — pressing Escape while the settings panel is open now only closes the panel. Previously the global Escape handler also fired, making the whole window disappear.
- **Link titles with non-ASCII characters** (umlauts, Chinese, emoji, etc.) now decode correctly. The HTTP title fetcher was decoding bytes as Latin-1; it now buffers raw bytes and decodes as UTF-8.
- Clipboard poll errors now route through the structured log file instead of `console.error`.

### Removed
- Dead code: `countAll()` (db/items), `truncate()` (lib/format), `loading` state (use-items hook), unused `--scrollbar`/`--scrollbar-h` CSS variables.

---

## v0.2.4 — 2026-04-30

Internal build bump — no user-facing changes.

---


## v0.2.3 — 2026-04-30

### Fixed
- **Paste now works** — `autoPaste` defaulted to `false` so nothing ever pasted. Default is now `true`, and paste intent is passed explicitly through the IPC layer so copy-only actions never accidentally arm it.
- **Search auto-focus** — the search bar now receives focus automatically when the window appears, with an 80 ms delay to let the OS finish handing focus to the Electron window. No more having to click first.
- **Scrollbar removed** — scroll containers no longer show a visible scrollbar. Scroll still works normally with the mouse wheel or trackpad.

### Changed
- **Compact list shows 25 items** instead of 10.

---

## v0.2.2 — 2026-04-27

Patch release — internal build pipeline fix. No user-facing changes.

---

## v0.2.1 — 2026-04-27

### Added
- **Auto-update** — running instances check for new releases on startup and every 4 hours. Updates download silently in the background; a slim banner appears at the bottom of the window with a "Restart now" button when the update is ready. The tray menu also gains a "Restart to update" item.
- **GitHub Actions release workflow** — pushing a `v*` tag triggers a Windows build and publishes the installer + `latest.yml` to GitHub Releases automatically (`npm run build:publish`).

---

## v0.2.0 — 2026-04-27

### Changed
- **Remove copy action button** — clicking a row already pastes to the active app; the redundant copy icon is gone. Shift+Enter in the search bar still copies without pasting.
- **Delete confirmation** — the trash icon now requires two clicks. First click turns it red (armed); second click confirms the deletion. The button auto-disarms after 2 s or when focus leaves it.

---

## v0.1.15 — 2026-04-27

### Added
- **Favicons for link items** — link rows show the site's favicon via Google's favicon service; falls back to the link icon when unavailable.
- **Whole-row category tinting** — each row carries a very subtle background wash matching its type (blue = text, violet = links, rose = images). Implemented via CSS custom properties on each row so future types only need a single token addition.

### Changed
- **Window anchored to cursor** — top-left corner of the window now snaps to the cursor position; flips left or up when near a screen edge.
- **Settings in compact view** — the settings panel is now reachable from the compact view, not only from the expanded view.

### Fixed
- **Auto-paste** — after selecting an item, the window is briefly truly hidden so the OS returns focus to the target app before Ctrl+V is sent.

---

## v0.1.14 — 2026-04-27

### Changed
- **Flicker eliminated** — replaced the show/hide OS window cycle with opacity + mouse-event masking. The renderer is pre-shown once at startup (opacity 0) and stays permanently live; `setOpacity(1/0)` reveals/hides it instantly with no paint flush.

---

## v0.1.13 — 2026-04-27

### Changed
- Denser list row padding.
- Per-category colour tints on type icons (blue = text, violet = links, rose = images).

### Fixed
- Blur guard extended to 500 ms to reduce spurious hides on focus acquisition.

---

## v0.1.12 — 2026-04-27

### Changed
- List view replaced with HeroUI `ListView` (React Aria GridList). Removes custom `item-row.tsx` and `use-list-nav.ts`.
- Window mode (compact/expanded) persisted in the database and restored on next launch.
