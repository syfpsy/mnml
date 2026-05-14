# mnml Changelog

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
