# mnml

A super-minimal, Windows-first clipboard manager. Captures text, images, and
links; stores them locally; finds them back with smart search; pops up from
anywhere with a double-tap of `Alt`.

**Status:** MVP. Local-first. No accounts, no sync, no cloud.

## What's in the MVP

- **Clipboard capture** — text, images, and links (URLs are auto-classified)
- **Local persistence** — SQLite at `%APPDATA%\mnml\mnml.sqlite`
- **Smart search** — hybrid FTS5 BM25 + character-trigram similarity (a lean
  "semantic-ish" layer that handles typos and partial words)
- **Double-Alt hotkey** — show/hide globally, with guards that keep normal
  `Alt` usage working
- **Compact + expanded modes** — compact shows last 10 items, expanded adds
  tabs (All / Text / Links / Images) and settings
- **Reuse** — click or press `Enter` to re-copy and dismiss; `Shift+Enter`
  re-copies without hiding the window
- **Pin** — pinned items always sort first and are exempt from the trim limit
- **Full keyboard nav** — `↑/↓` walks the list, `Ctrl+Home/End` jumps to top/bottom,
  active row scrolls into view
- **Minimal settings** — monitoring toggle, launch-on-startup, max items,
  clear history (two-step inline confirm)

## Requirements

- Windows 10/11
- Node 20+ (tested on 22)

## Run it

```bash
npm install
npm run dev
```

`npm install` runs `electron-rebuild` on `better-sqlite3` so the native binding
matches Electron's ABI. `uiohook-napi` uses its prebuilt N-API binary as-is.

In dev mode, devtools auto-open in a detached window so the renderer console
is always visible.

## Hotkeys

- **Double-tap `Alt`** — primary toggle (uses a global keyboard hook)
- **`Ctrl+Shift+V`** — fallback, always works even if the global hook is
  blocked by Windows policy

## Troubleshooting

Every startup writes to `%APPDATA%\mnml\mnml.log`. If the window doesn't
appear when you double-tap Alt, check that file — it should show:

```
[startup] booting · log file: ...\mnml.log
[hotkey] uiohook started, listening for double-Alt within 380 ms
[hotkey] fallback shortcut Control+Shift+V registered
```

When you actually double-tap Alt, you should see `[hotkey] double-alt fired`
followed by `[show] window shown at ...`. If the first line shows up but the
window stays hidden, Windows blocked the foreground steal — try
`Ctrl+Shift+V`. If `[hotkey] double-alt fired` never shows, the OS isn't
delivering Alt events to our hook (rare; usually means another app is
intercepting first, or `uiohook` failed to attach — the log will say so).

A common gotcha: **a stale `electron.exe` from a previous dev run** holds the
single-instance lock and silently swallows new launches. Kill it with
`taskkill /F /IM electron.exe` before retrying `npm run dev`.

## Build a Windows installer

```bash
npm run build
```

Output goes to `release/`. First-run will ask for accessibility permission for
the global keyboard listener (standard Windows prompt).

## How the UI behaves

**Compact** (`440×540`, frameless, centered):
- Search input + expand button in the header
- Last 10 items
- `↓` to walk the list, `Enter` to paste, `Esc` to clear or hide

**Expanded** (`880×680`):
- Same search bar
- Tabs: All / Text / Links / Images
- Settings button opens a lean in-view panel

The window auto-hides on blur. Double-tap `Alt` to bring it back.

## Data & privacy

Everything is local:
- `%APPDATA%\mnml\mnml.sqlite` — metadata, text, URLs, FTS index
- `%APPDATA%\mnml\images\` — copied images as PNG files

Delete those two paths (or use **Clear history** in Settings) to wipe state.

## Next sensible improvements

See [`ARCHITECTURE.md`](./ARCHITECTURE.md#future) for the replaceable seams,
but in priority order:
1. Swap the trigram fallback for a real local embedding backend
   (`@xenova/transformers` with `all-MiniLM-L6-v2`) — the `SearchService`
   abstraction already isolates this.
2. Optional link-metadata fetch (title / og:image) on a worker thread.
3. Pinning / favorites.
4. Lightweight image OCR (opt-in) to make screenshots searchable.
5. Auto-paste after restore (currently we re-copy — user still presses Ctrl+V).

## Test checklist

See [`ARCHITECTURE.md`](./ARCHITECTURE.md#test-checklist).
