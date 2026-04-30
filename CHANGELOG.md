# mnml Changelog

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
