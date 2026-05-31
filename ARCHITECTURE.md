# mnml — architecture

How the app works, subsystem by subsystem. Build/release lives in
[`RELEASING.md`](./RELEASING.md), the design system in [`DESIGN.md`](./DESIGN.md),
product intent in [`PRODUCT.md`](./PRODUCT.md), history in [`CHANGELOG.md`](./CHANGELOG.md).
If you change a subsystem, update its section here in the same commit.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Electron 33 (Chromium 130) | First-class Windows clipboard API + global-shortcut infra |
| Bundler | Vite 6 + `vite-plugin-electron` | One config builds renderer + main + preload, HMR in dev |
| UI | React 19 + TypeScript | Single overlay window; no UI component framework |
| Styling | Tailwind v4 (`@tailwindcss/vite`) | Utilities + a CSS-variable token system in `styles.css` |
| Persistence | `better-sqlite3` 11 (sync) | Embedded, synchronous, FTS5 built in; rebuilt to Electron's ABI |
| Input | `uiohook-napi` 1.5 | System-wide key/mouse hook; double-Alt detect; synth paste |
| Updates | `electron-updater` 6 | Background auto-update from a published `latest.yml` |
| Packaging | `electron-builder` 25 | NSIS one-click installer (`mnml-setup.exe`) |

No HeroUI, no `motion`/Framer, no embeddings, no trigram search. Earlier revisions
had some; they were removed. Don't reintroduce them without a reason.

## Process model

- **Main** (`electron/`, Node) owns all native concerns: SQLite, clipboard poller,
  global double-Alt hook, Win32 foreground activation, tray, auto-updater,
  auto-launch, launcher index.
- **Renderer** (`src/`, React) is a **single** frameless overlay (440×540). It
  never touches Node directly — only `window.mnml`, a typed bridge from
  `preload.ts` via `contextBridge`. There is one window size (no expanded mode).

## Folder layout

```
electron/
  main.ts            Window lifecycle, hotkey, focus, tray, updater, auto-launch
  preload.ts         contextBridge → window.mnml (typed MnmlApi); preload.d.ts = ambient types
  ipc.ts             ipcMain.handle wiring        ipc-channels.ts  shared channel/payload names
  clipboard/
    monitor.ts       500 ms poll: sensitive guard, dedupe, image write, link enrichment
    classifier.ts    text vs link (URL) + preview truncation (≤280)
  db/
    index.ts         init, migrations, journal mode, idle-close lifecycle
    items.ts         clipboard CRUD + trim + pin    saved.ts  snippet CRUD
    settings.ts      JSON key/value + typed defaults  data-dir.ts  data folder resolve/relocate
  search/
    service.ts       FTS5 BM25 + LIKE fallback       tokenize.ts  normalize/escapeFtsQuery
    app-search.ts    in-memory launcher index + launch
    windows-settings.ts  curated ms-settings: + .msc/.cpl list
  hotkey/double-alt.ts   two Alt key-ups ≤380 ms, no key between → fire
  utils/             hash.ts (sha1), urls.ts, link-meta.ts (fetchTitle + SSRF guard), log.ts
src/
  main.tsx, app.tsx  root mount; theme apply, focus backup, Esc-hide, update events
  types.ts
  components/        compact-view (the whole window), search-bar, items-list, app-results-list,
                     saved-list, settings-panel, update-banner, icons
  hooks/             use-items, use-saved, use-app-search, use-settings
  lib/               bridge.ts (typed window.mnml), format.ts (splitHighlight)
  styles.css         Tailwind import + the full token system
build/  icon.svg master → icon-*.png, icon.ico, tray.png, installer.nsh
scripts/ bump-version, make-icons, copy-native-deps, check-window-summon-rules
site/   static landing page (see site/README.md)
```

## Data model

SQLite at `<dataDir>/mnml.sqlite`. `migrate()` (in `db/index.ts`) runs **once per
process** (guarded, because the connection idle-closes/reopens).

```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('text','image','link')),
  content_text TEXT,   -- raw text (URL for links, "Image · WxH" for images)
  content_url  TEXT,   -- canonical URL for links
  image_path   TEXT,   -- <dataDir>/images/<sha1>.png
  title TEXT, hostname TEXT,         -- title = image dims or fetched link title
  preview TEXT NOT NULL,             -- truncated display string (≤280)
  hash TEXT NOT NULL UNIQUE,         -- SHA-1 dedupe key
  byte_size INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,  -- updated_at bumps on re-copy
  pinned_at INTEGER                  -- NULL = unpinned
);
-- Sort everywhere: (pinned_at IS NULL) ASC, pinned_at DESC, updated_at DESC
-- The maxItems trim deletes UNPINNED rows only.

CREATE VIRTUAL TABLE items_fts USING fts5(            -- external-content mirror,
  preview, content_text, title, hostname,             -- kept in sync by AI/AD/AU
  content='items', content_rowid='id',                -- triggers on `items`
  tokenize='unicode61 remove_diacritics 2');

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- JSON values
CREATE TABLE saved_snippets (id PK, label, content, created_at, updated_at);
```

Indexes: `idx_items_created_at`, `idx_items_type`, `idx_items_pinned_at`,
`idx_saved_updated_at`. Migration also **drops** the legacy `pc_entries*` /
`pc_index_meta` tables from the removed v0.2.16–v0.2.22 disk indexer.

## DB connection lifecycle (idle-close)

mnml is always-on but its DB use is **bursty**, and a continuously-open handle
blocks a cloud syncer from cleanly replacing `mnml.sqlite` (it forces `.conflict`
files). So `db/index.ts` doesn't hold the connection:

- `getDb()` opens lazily and re-arms a **5 s idle timer** on every call.
- After 5 s idle, `closeDb()` checkpoints (`wal_checkpoint(TRUNCATE)`) + releases.
  Next `getDb()` reopens (~1 ms). `migrate()` is once-per-process, so reopen is cheap.
- **Journal mode by location**: default `%APPDATA%` ⇒ `WAL` (sidecars harmless,
  never synced); custom (likely synced) folder ⇒ `DELETE`, so the single file is
  self-consistent after each commit and safe to replicate. `synchronous = NORMAL`.
- `before-quit` stops the monitor then `closeDb()` (merges the WAL).

Because the connection idle-closes between summons, the renderer refetches on
summon **only when the folder is custom** (`syncing`), surfacing another device's
changes on the next Alt-Alt with no restart.

## Storage folder (cross-device sync) — `db/data-dir.ts`

Defaults to `app.getPath("userData")` (`%APPDATA%/mnml`); the user can re-point it
to any local folder (typically a synced cloud folder). The path persists to
`storage-location.json` in `userData` (the one machine-anchored file).
`setDataDir(target)`: ensure exists + writable (probe-write); if target already has
`mnml.sqlite`, **adopt it** (don't copy local over remote); else copy
sqlite+wal+shm+`images/`; write the pointer; `rollbackCopy()` on pointer-write
failure. Falls back to default if the folder is missing/unreadable without
discarding intent. IPC closes the DB, migrates, restarts. **One-device-at-a-time**
by design: $0, no server, data only in the user's own cloud.

## Clipboard monitor — `clipboard/monitor.ts`

`setInterval(500 ms)`:

1. **Sensitive-content guard first.** `isClipboardConcealed()` checks the Windows
   "do not record" markers **before reading any content**:
   `ExcludeClipboardContentFromMonitorProcessing` (set by 1Password / KeePass /
   Bitwarden / browser password fields) and `CanIncludeInClipboardHistory == 0`.
   Concealed content is never read, hashed, stored, or synced. **Fail-open** on a
   query error. Logged once per episode, never *what*.
2. **Image before text.** A `getSize()` dimension fingerprint + 4 s recheck window
   avoids re-encoding a 4K bitmap (`toPNG()`) every tick. New images write to
   `<dataDir>/images/<sha1>.png`.
3. **Text.** SHA-1 dedupe vs `lastTextHash`; classified link vs text. Links insert
   immediately, then fire background `fetchTitle()` enrichment.
4. After each insert, `trim()` enforces `maxItems` on unpinned rows.

No `getSetting("monitoring")` inside `poll()` — the timer only runs while
monitoring is on (`start()`/`stop()` track the setting), and reading it per-tick
would call `getDb()` and defeat the idle-close. `restoreItem()`/`restoreText()`
update the last-seen hash so mnml never re-ingests its own write.

**Link titles** (`utils/link-meta.ts`): `fetchTitle(url)` reads the page `<title>`,
guarded by `isPrivateHostname()` (blocks localhost / RFC1918 / link-local / IPv6
ULA) at entry and on every redirect; 8 KB / 4 s / 2-redirect caps. Success →
`updateTitle()` + an `onItemUpdated` event patches the row in place. Favicons are
fetched client-side from Google's favicon service.

## Search — `search/service.ts`

Stateless; queries SQLite each call (table capped at `maxItems`, default 200).
Empty query → recent rows, pinned first. Primary path → FTS5 `MATCH` + BM25
(normalized `1/(1+bm25)`), pinned-first then score then recency. If FTS yields
nothing → case-insensitive `LIKE` over the same four columns (covers too-short /
unicode-quirk queries). `tokenize.ts` does `normalize()` + `escapeFtsQuery()`. <5 ms.

## App launcher — `search/app-search.ts` + `windows-settings.ts`

Keyboard launcher shown inline beneath the clipboard list when a query is active.
**In-memory only** (replaced the removed disk indexer).

- **Index** (`rebuildAppIndex()`, once at startup): the curated `WINDOWS_SHORTCUTS`
  list (~80 `ms-settings:` deep links + classic `.msc`/`.cpl`/command tools) plus a
  sync walk of Start-Menu/Desktop `.lnk` files, each with lowercased aliases.
- **Scoring** (`searchApps()`): exact 100, prefix 85, substring 70, all-words 55,
  acronym 42, subsequence 28; ties break by kind (settings > tools > apps). Top 12.
- **Icons**: lazy `app.getFileIcon` on the `.lnk`'s **resolved target** (via
  `shell.readShortcutLink`), not the `.lnk` (which yields the generic overlay);
  48 px source, LRU cache cap 256. Settings/tools use a kind glyph.
- **Launch**: `ms-settings:` → `openExternal`; paths → `openPath`; bare commands /
  `.msc` / `.cpl` → `start "" <cmd>` so the shell resolves PATH + handlers.

## Saved snippets — `db/saved.ts`

User-curated reusable text, independent of the volatile history. CRUD with a
defensive 500-row list cap. Label defaults to the first non-empty line (≤60 chars);
content stored verbatim. `touchSaved` floats used snippets up. Searched in-memory
(small dataset). One-click "save from item" via `savedFromItem`.

## Global hotkey — `hotkey/double-alt.ts`

`uiohook-napi` system-wide: fire on the **second Alt key-up within 380 ms** with no
other key between (so Alt+Tab and combos still work); self-suppress 1 s after
firing. `suppressDoubleAltFor(ms)` mutes the detector around mnml's own synthetic
Alt taps. Fallback global shortcut `Ctrl+Shift+V` for when the hook is policy-blocked.

## Window + Win32 foreground activation — `main.ts`

One frameless, non-resizable, always-on-top, `skipTaskbar` `BrowserWindow`
(440×540), loaded while hidden; summon toggles visibility.

- **Position**: anchored at the cursor, flipped/clamped to the active monitor's work area.
- **No theme flash**: persisted `lightTheme` is read at create and passed as
  `?theme=…`; an inline boot script sets the `<html>` class before first paint;
  `backgroundColor` mirrors `--bg`.
- **The Win32 problem**: a `uiohook` double-Alt is a low-level hook event, not an
  OS accelerator, so Windows may show the window but deny it foreground focus. **Fix**:
  a long-lived hidden PowerShell helper loads a Win32 shim once and per summon
  `AttachThreadInput`s around the foreground + our thread, sends a synthetic Alt tap
  to clear the foreground lock, then `SetForegroundWindow`/`SetFocus`; delayed
  passes re-focus the search input.
- **Hide**: deferred blur (Alt-Tab/click-away, debounced ~500 ms + 150 ms re-check; DevTools excepted; in-window pointer suppressed), a
  global `mousedown` outside bounds (via `screen.getCursorScreenPoint()`), or Esc. Single-instance lock; second instance → show.

## Auto-paste — `main.ts`

Opt-in (`autoPaste`, default **true**). `restore(id, paste=true)` sets
`pastePending`; on hide, the helper restores the HWND captured *before* the summon
(`prevForegroundHwnd`), waits ~150 ms, then synthesizes Ctrl+V via `uIOhook.keyTap`
(fallback: a one-shot `wscript` VBS `SendKeys "^v"`). Shift+Enter / Shift-click copy
without pasting.

## Tray, updater, auto-launch

- **Tray**: loads multi-resolution `build/icon.ico` (falls back to `tray.png`, then
  a transparent placeholder). Click toggles; menu = Show/Hide, update entry when
  ready, Quit.
- **Auto-updater** (packaged only): `electron-updater`, `autoDownload`, checks on
  startup then every 24 h; events drive the renderer banner + tray; provider config
  in `package.json` (see `RELEASING.md`).
- **Auto-launch** (`syncLoginItemWithSetting`): on every boot + toggle, reconcile the
  `launchOnStartup` setting (default true) with the HKCU Run entry, correcting drift.

## IPC contract

Names in `ipc-channels.ts`, handlers in `ipc.ts`, renderer sees only `window.mnml`
(typed `MnmlApi` in `preload.ts`, wrapped by `lib/bridge.ts`):

```
Items     listRecent(limit?,type?)→Item[] · search(q,type?,limit?)→Item[]
          restore(id,paste=false) · remove(id) · clear() · pin(id,pinned) · getImageDataUrl(id)
Launcher  appSearch(q)→{results} · appLaunch(target)→bool
Snippets  savedList/savedAdd/savedUpdate/savedRemove/savedRestore(id,paste=false)/savedFromItem
Settings  getSettings/updateSetting · hide · setBlurLock · installUpdate · checkUpdate · getVersion
Storage   storageGet→{dataDir,defaultDir,isDefault} · storagePick · storageSet/Reset → {ok,changed,…} · storageReveal
Events→   onItemAdded · onItemUpdated · onVisibilityChanged · onUpdateAvailable · onUpdateDownloaded · onSavedChanged
```

## Renderer

`app.tsx` mounts `CompactView` and owns theme application, a backup focus loop,
global Esc-hide, and the update-event subscription (passed down as banner state).
`compact-view.tsx` is the whole window:

- **Search bar** (`data-mnml-search`) routes Enter/Arrows/Delete/Esc to the active
  list; Enter activates row 0 (Shift = copy-only), falling through to the first app result.
- **Tabs** (`role="tablist"`): All / Text / Links / Images / Saved. First four filter
  clipboard items by type; Saved switches to snippets (search filters snippets).
- **Content**: `ItemsList` (+ inline `AppResultsList` when a query is active, on
  non-Saved tabs) or `SavedList`.
- **Quick-paste Ctrl+1..9**: one window-level listener via a ref (sees current state
  without re-subscribing); pastes the Nth row of the active list. Guarded while
  Settings is open or a snippet textarea is focused.
- **Update banner** + **footer** sit below an `inert`-ed subtree so the `aria-modal`
  Settings sheet traps focus while the banner stays clickable.

Hooks: `use-items` (debounced query + live add/update patching), `use-saved`,
`use-app-search` (debounced), `use-settings`.

## Settings — `db/settings.ts`

JSON key/value, typed defaults: `monitoring` true, `maxItems` 200, `launchOnStartup`
**true**, `autoPaste` true, `lightTheme` false. Stored row wins; defaults apply only
to never-touched keys.

## Deliberate tradeoffs

- **Poll, don't subscribe** — Windows surfaces no reliable cross-process clipboard
  event to Electron; 500 ms is cheap.
- **Idle-close the DB** — a ~1 ms reopen buys clean folder-sync handoff.
- **In-memory launcher** — the old disk crawler was too heavy for the value.
- **No embeddings/trigram** — at ≤200 rows FTS5 + LIKE is instant.
- **Re-copy + optional synth-paste**, not deep injection — robust across apps.
- **Custom settings sheet**, `inert`-trapped — matches the utility feel.
- **One window size** — a launcher doesn't need a second layout.

## Manual smoke test

Copy text → top; copy again → no dup, moves up; copy a URL → Link, title fills in;
copy from a password manager → nothing. Search filters; Esc clears then hides.
Launcher: "bluetooth" / "task manager" appear and launch. Saved: save, switch tab,
filter, activate. Quick-paste: Ctrl+3 pastes the third row. Pin survives the trim.
Alt-Alt toggles; Alt+Tab unaffected. Storage: point at a folder → restart + data; reset.
Update banner appears for a newer published version.
