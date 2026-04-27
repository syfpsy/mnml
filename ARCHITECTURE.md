# mnml — architecture

Short, honest notes on how the MVP is put together and where the seams are.

## Stack

| Layer      | Choice                                            | Why                                                                 |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Shell      | Electron 33                                       | First-class Windows clipboard API, mature global shortcut infra     |
| Bundler    | Vite 6 + `vite-plugin-electron/simple`            | Single config handles renderer + main + preload + HMR               |
| UI         | React 19, HeroUI v3 + HeroUI Pro v3, Tailwind 4   | Already in the repo; v3 is provider-less (just import the CSS)      |
| Motion     | `motion` (Framer Motion fork)                     | Already in deps                                                     |
| Persistence| `better-sqlite3` (rebuilt for Electron ABI)       | Sync, embedded, FTS5 built-in                                       |
| Hotkey     | `uiohook-napi`                                    | Prebuilt Windows binary, N-API ABI-stable, can detect bare modifiers|
| Search     | SQLite FTS5 + character-trigram Jaccard (hybrid)  | Lean "semantic-ish" layer; no model download; clean seam to swap    |

## Folder layout

```
electron/                  Main process (Node)
  main.ts                  App entry, window lifecycle, hotkey → show/hide
  preload.ts               contextBridge surface → window.mnml
  ipc.ts                   All ipcMain.handle wiring
  ipc-channels.ts          Shared channel names + types
  clipboard/
    monitor.ts             500 ms poll, dedupe, image disk-write, emits new items
    classifier.ts          text / link (URL regex) / image classification
  db/
    index.ts               better-sqlite3 init, WAL, migrations, images dir
    items.ts               CRUD + trim + index view
    settings.ts            JSON-encoded key/value settings
  search/
    service.ts             search(query, opts) → ScoredItem[] (hybrid blend)
    tokenize.ts            normalize, trigrams, Jaccard, FTS query escape
  hotkey/
    double-alt.ts          Two Alt keyups ≤320 ms, any other key resets
  utils/
    hash.ts, urls.ts

src/                       Renderer (React)
  main.tsx, app.tsx        Root + compact/expanded switcher
  components/
    compact-view.tsx
    expanded-view.tsx
    items-list.tsx
    item-row.tsx
    search-bar.tsx
    settings-panel.tsx
    icons.tsx
  hooks/
    use-items.ts           Debounced fetch + live "new item" subscription
    use-settings.ts
  lib/
    bridge.ts              Typed wrapper over window.mnml
    format.ts
  styles.css               `@import "tailwindcss"` + `@import "@heroui/styles"`
  types.ts
```

## Data model

```sql
CREATE TABLE items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL CHECK(type IN ('text','image','link')),
  content_text TEXT,            -- raw text (URL for links, synthetic for images)
  content_url  TEXT,            -- canonical URL for links
  image_path   TEXT,            -- absolute path under %APPDATA%/mnml/images/
  title        TEXT,            -- optional title (image dims, link title later)
  hostname     TEXT,            -- host for links (no www.)
  preview      TEXT NOT NULL,   -- truncated display string
  hash         TEXT UNIQUE,     -- SHA-1 dedupe key
  byte_size    INTEGER,
  created_at   INTEGER,
  updated_at   INTEGER,         -- bumped when an identical hash is re-copied
  pinned_at    INTEGER          -- NULL = unpinned; otherwise pin timestamp
);
-- Items sort order everywhere: (pinned_at IS NULL) ASC, pinned_at DESC, updated_at DESC
-- The trim limit only applies to unpinned rows.

-- external-content FTS5 mirror, kept in sync via triggers
CREATE VIRTUAL TABLE items_fts USING fts5(
  preview, content_text, title, hostname,
  content='items', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
```

## Search — hybrid, swappable

`search(query, { type?, limit? })` blends two signals:

1. **Keyword (FTS5 BM25)** — SQLite MATCH with prefix-expanded tokens; BM25 score
   normalized to `1 / (1 + bm25)`.
2. **Fuzzy/semantic-ish (trigrams)** — every item's searchable text is
   character-trigrammed and cached in-process; query trigrams are Jaccard-compared.

Final rank: `0.6 · keyword + 0.4 · trigram`, tiebroken by `updated_at`.

This is intentionally lean: no model download, no inference cost, good enough for
typos and partial matches. The `SearchService` surface is a single function and
the cache is rebuilt lazily via `markIndexDirty()`, so a real embedding backend
(e.g. `@xenova/transformers` with `all-MiniLM-L6-v2`) can drop in by replacing
the trigram cache with a vector index — callers don't change.

## Clipboard monitoring

`setInterval(500ms)` polls:
- image first (`clipboard.readImage`) — screenshots usually have empty text
- then text (`clipboard.readText`) — classified as link (URL regex) or text
- hashes compared against last-seen to dedupe; duplicates only bump `updated_at`
- images saved to `%APPDATA%/mnml/images/<hash>.png`

Re-copying uses the same path — writing back to the clipboard updates the
"last seen" hash so we don't re-ingest our own write.

## Global hotkey

`uiohook-napi` listens system-wide. We track `Alt` keyups and fire the listener
on the second one within 380 ms. If **any other key** is pressed between the
first Alt-down and the next Alt-up, we reset the timer — so `Alt+Tab` and
shortcut combos keep working normally.

## Window

Single `BrowserWindow`: frameless, transparent, always-on-top, skipTaskbar,
auto-hide on blur. Compact = 440×540, expanded = 880×680. Mode changes resize
and recenter above the active display's work area.

## IPC contract

All channels flow through `electron/ipc-channels.ts`; the renderer only sees
`window.mnml` which is typed via `MnmlApi` in `preload.ts`. Calls:

```
listRecent(limit?, type?)      → Item[]
search(q, type?, limit?)       → Item[]
restore(id)                    → void    (re-copies to clipboard)
remove(id)                     → void
clear()                        → void
pin(id, pinned)                → void
getImageDataUrl(id)            → string | null
getSettings()                  → AppSettings
updateSetting(key, value)      → AppSettings
hide()                         → void
setMode(mode)                  → void
setBlurLock(locked)            → void    (suppresses auto-hide while modal up)
onItemAdded(cb)                → unsubscribe
onVisibilityChanged(cb)        → unsubscribe
```

## Tradeoffs we made on purpose

- **No embeddings in MVP.** Trigram Jaccard gives decent fuzzy matching with
  zero download cost. The `search/service.ts` surface is built to swap without
  churn.
- **Polling over clipboard events.** Windows has no cross-process clipboard
  change notification surfaced to Electron; 500 ms polling is cheap and simple.
- **Image data read on demand.** Thumbnails are requested per-row as data URLs,
  so the main window isn't forced to hold all images in memory.
- **No Tooltip component.** HeroUI's Tooltip requires more plumbing than the
  MVP needs; `aria-label` is sufficient for accessibility.
- **Custom settings panel, not HeroUI Modal.** HeroUI's Modal has a deeper
  compound API; a dedicated in-view panel is simpler, renders in-window, and
  matches the utility feel.
- **Auto-hide on blur.** Matches native-utility expectations. DevTools state
  is excepted so debugging isn't painful.
- **Re-copy, not auto-paste.** Simulating a paste keystroke cross-app is
  platform-sensitive and fragile for an MVP. User presses `Ctrl+V` after
  restore. Easy upgrade path later.

## Test checklist

### Capture
- [ ] Copy a plain text string — it appears at the top of the list.
- [ ] Copy the same string again — no duplicate row; it moves to the top.
- [ ] Copy `https://example.com` — appears as a Link with hostname.
- [ ] Copy `www.example.com` — also classified as Link.
- [ ] Copy a string with whitespace inside — stays Text (not Link).
- [ ] Take a screenshot (`PrintScreen` → Snipping Tool copy) — appears as Image
      with visible thumbnail.
- [ ] Copy a 10 KB image and a 2 MB image — both captured; byte size shown.
- [ ] Clipboard read failures don't crash the monitor (force one via a locked
      clipboard owner to confirm).

### Search
- [ ] Empty query shows recent items.
- [ ] Typing a keyword returns matching items, most relevant first.
- [ ] A typo (e.g. "sempantic") still surfaces items containing "semantic" —
      trigram layer working.
- [ ] Switching tab re-filters the same query.
- [ ] `Esc` with a non-empty query clears it; a second `Esc` hides the window.

### Reuse & pinning
- [ ] Double-click an item → window hides, clipboard contains that item.
- [ ] Select + `Enter` → same.
- [ ] Select + `Shift+Enter` → clipboard updated, window stays open.
- [ ] Re-copying an image round-trips (paste into Paint or similar).
- [ ] Pin an item → it sticks to the top across captures, tabs, and search.
- [ ] Pinned items survive the max-items trim.

### Keyboard
- [ ] `↑` / `↓` walk the list, the active row stays visible.
- [ ] `Ctrl+Home` / `Ctrl+End` jump to top / bottom.
- [ ] Search input keeps focus throughout — clicking a row doesn't steal it.

### Hotkey
- [ ] Double-tap `Alt` shows the window centered on the active monitor.
- [ ] Second double-tap hides it.
- [ ] `Alt+Tab` still switches windows normally (not intercepted).
- [ ] Holding `Alt` for a long time and releasing once doesn't trigger.

### Settings
- [ ] Toggle monitoring off → new copies are ignored.
- [ ] Toggle monitoring on → capture resumes.
- [ ] Set Max items to 20, exceed it → oldest *unpinned* items pruned.
- [ ] Launch on startup — app appears in Task Manager startup entries after
      toggle.
- [ ] Clear history — first click arms the danger state, second click within
      ~3.5 s actually clears.
- [ ] Settings panel stays open while interacting with the NumberField — the
      blur-lock prevents the surrounding window from auto-hiding.

### UI polish
- [ ] Compact → Expanded transition is smooth.
- [ ] Focus stays on the search input on open.
- [ ] Blur (click outside) hides the window.
- [ ] DevTools can be opened and doesn't auto-hide the window.

## System tray

A `Tray` is created on startup with a programmatic 16×16 white "M" bitmap
(`nativeImage.createFromBitmap`). Left-click toggles the window; right-click
shows "Show / Hide" and "Quit mnml". The tray is the user's escape hatch when
the window is hidden and the hotkey isn't available.

## Auto-paste

Opt-in setting (`autoPaste`, default false). When the main process handles
`mnml:items:restore`, it checks `getSetting("autoPaste")`. If true it sets
`pastePending = true`. The `win.on("hide")` handler fires shortly after and
runs `wscript //nologo paste.vbs`, a tiny VBScript file written once to
`%APPDATA%\mnml\paste.vbs`. The script sleeps 60 ms (for focus to return to
the target window) then calls `ws.SendKeys "^v"`. WScript starts in ~60 ms,
making total latency from Enter-press to paste roughly 200 ms.

`Shift+Enter` (copy-only) never sets `pastePending` — it's always a quiet
background copy.

## Link title enrichment

After inserting a link item, `monitor.ts` fires `fetchTitle(url)` (async,
`electron/utils/link-meta.ts`). On success: `updateTitle(id, title)` writes to
SQLite, `markIndexDirty()` queues a search-index rebuild, and `emitUpdate(item)`
pushes an `mnml:event:item-updated` event to the renderer. `useItems` subscribes
and patches the item in-place — no re-sort, no flash.

## Search highlighting

`splitHighlight(text, query)` in `src/lib/format.ts` splits text at query-term
boundaries using `RegExpExecArray` iteration (no `re.test` to avoid global-flag
`lastIndex` drift). The `Hl` component renders non-matching runs as plain text
and matches as amber-tinted `<mark>` elements.

## Future

Safe to do without touching the core loop:

- Embeddings backend (`src/search` swap). Caching can be incremental.
- OCR for images — optional, triggered asynchronously after insert, populates
  `content_text`, re-runs FTS index.
- og:image thumbnail for link items (store URL; fetch and cache on first view).
- Auto-paste after restore — currently uses WScript SendKeys; a proper Win32
  `SendInput` call (via `koffi`) would be ~5 ms faster and more reliable.
