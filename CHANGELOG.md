# mnml Changelog

## v0.2.2 — 2026-04-27

<!-- fill in release notes here -->


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
