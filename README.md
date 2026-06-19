<img src="build/icon-256.png" width="88" alt="mnml icon" align="left" />

# mnml

A keyboard-first clipboard manager for **Windows and macOS**. Press **Alt** twice (Windows) or **Option** twice (Mac); paste from history, launch apps and settings, save reusable snippets. One 440×540 window. Local SQLite. No accounts, no telemetry.

<br clear="left" />

**[⬇ Windows](https://mnml.nxyz.art/mnml-setup.exe)** · **[⬇ macOS](https://mnml.nxyz.art/mnml-mac.dmg)** · MIT licensed

---

## What it does

- **Clipboard history** — text, links (with favicons), and image screenshots (96 px thumbnails). Full-text search (SQLite FTS5 with a LIKE fallback). Pin items to keep them past the rotation cap.
- **Quick-paste** — press **Ctrl + 1…9** to paste one of the first nine items instantly. Pasting strips formatting, so you always get clean plain text.
- **Saved snippets** — reusable text (signatures, regexes, commands) that never rotate out. One-click save from any clipboard row.
- **Launcher** — Start-Menu apps + ~80 curated `ms-settings:` deep links (Bluetooth, Display, Sound, Update…) + classic `.msc` / `.cpl` tools (Task Manager, Device Manager, Registry Editor…), all in the same search.
- **Never your passwords** — mnml honors the Windows "do not record" clipboard flag, so content from password managers (1Password, KeePass, Bitwarden) and browser password fields is never captured.
- **Folder sync** — point the storage folder at Dropbox / OneDrive / iCloud and your clipboard follows you across devices (one machine at a time). No server, no account; the data only ever lives in your own cloud storage.
- **Auto-launch + auto-update** — starts with Windows so the hotkey is always live; updates itself in the background.
- **Light + dark themes**, WCAG-AA contrast in both.

## Hotkeys

| Key | Action |
|---|---|
| **Alt Alt** (double-tap) | Show / hide, anywhere |
| **Ctrl + Shift + V** | Fallback toggle (if the global hook is blocked by policy) |
| **Ctrl + 1…9** | Quick-paste the Nth item |
| **↑ / ↓**, **Ctrl+Home/End** | Navigate the list |
| **Enter** | Paste · **Shift-click** a row to copy without pasting |
| **Esc** | Clear the search, or hide |

## Privacy

Everything is local by default:
- `%APPDATA%\mnml\mnml.sqlite` — metadata, text, URLs, FTS index
- `%APPDATA%\mnml\images\` — captured images as PNG files

No accounts, no cloud, no telemetry. The only outbound request is a daily update check. Password-manager content is never stored (see above). Use **Clear history** in Settings, or delete those paths, to wipe state.

> The installer is not yet code-signed, so Windows SmartScreen shows an "unrecognized app" prompt on first run — click **More info → Run anyway**. (Code signing via [SignPath Foundation](https://signpath.org/foundation) is in progress.)

## Build from source

```bash
npm install        # runs electron-rebuild on better-sqlite3 to match Electron's ABI
npm run dev        # dev mode (detached devtools)
npm run build      # produces release/mnml-setup.exe + latest.yml + .blockmap
npm run icons      # regenerate the app icon from build/icon.svg
```

Requires Windows 10/11 and Node 20+ (tested on 22).

## Architecture

Electron 33 + React 19 + TypeScript + Tailwind v4 + better-sqlite3 + uiohook-napi. The main process owns the clipboard monitor, the global double-Alt hook, native Win32 foreground activation, and the SQLite layer; the renderer is a single overlay window. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the internals and [`CHANGELOG.md`](./CHANGELOG.md) for release history.

## Documentation

| Doc | What's in it |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | Product intent, users, principles, tone, privacy stance, status |
| [`DESIGN.md`](./DESIGN.md) | Design system: color tokens, type, brand mark, focus/a11y, anti-patterns |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How it's built: stack, data model, every subsystem, the IPC contract |
| [`RELEASING.md`](./RELEASING.md) | Build pipeline, versioning, GitHub-Releases distribution, Vercel deploy, signing |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history (Keep-a-Changelog) |
| [`docs/bug-history.md`](./docs/bug-history.md) | Engineering log of notable bugs and fixes |
| [`site/README.md`](./site/README.md) | Landing-site structure and deploy |

## License

[MIT](./LICENSE) © syfpsy
