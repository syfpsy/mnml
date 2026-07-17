# mnml — product

The "why" and "who." Read this first when picking up the project cold. Companions:
[`ARCHITECTURE.md`](./ARCHITECTURE.md) (how it's built), [`DESIGN.md`](./DESIGN.md)
(how it looks), [`RELEASING.md`](./RELEASING.md) (how it ships).

```
register: product        # the app is a tool; design serves the work.
                         # (The landing site at site/ is the brand surface.)
```

## One line

A keyboard-first, local-first clipboard manager for Windows and macOS. Press
**Alt** twice on Windows or **Option** twice on Mac; paste from history, launch
apps and settings, save reusable snippets. One small window. No accounts, no
telemetry.

## What it is

Lives in the tray; summoned by a double-tap of Alt into a single 440×540 overlay.
From one search box:

1. **Clipboard history** — text, links (favicons + fetched titles), image
   screenshots. FTS5 search (+ LIKE fallback). Pin past the rotation cap.
   Quick-paste the first nine with **Ctrl+1..9**. Paste strips formatting → clean
   plain text.
2. **Launcher** — installed apps + settings deep links (Windows Start Menu /
   `ms-settings:` + classic tools; macOS Applications / System Settings), same
   search.
3. **Saved snippets** — reusable text that never rotates out.

It's **always-on** (launches at login, auto-updates) because a hotkey is useless if
the app isn't running.

## Who it's for

Keyboard-driven power users on Windows and Mac — developers, writers, support/ops —
who copy/paste constantly and resent the mouse or bloated launchers. They value
speed, privacy, and a tool that disappears. They accept (for now) the SmartScreen
"unrecognized app" prompt on Windows and the idea that their data is a local SQLite
file they can inspect or delete.

## Principles

1. **Keyboard-first** — summon, search, act, dismiss without the mouse.
2. **Local-first, private by default** — data is a local SQLite file; no server
   ever receives it. Only network calls: a daily update check + per-link
   favicon/title lookups (disclosed). Password-manager content is never captured.
3. **Minimal, on purpose** — one window, one search box, no settings sprawl, no noise.
4. **Always-on, zero-friction** — starts at login, auto-updates, gets out of the way.
5. **Honest** — the privacy page is specific; the changelog is real; no dark patterns.
6. **Free + open** — MIT, public source, claims are verifiable.

## Tone & voice

Quiet, precise, a little dry. Confident without hype. Copy is short and earns its
place — no fluff, no exclamation points, no emoji in the product. UI copy avoids em
dashes (engineering docs keep the repo's prose style). When explaining tech (privacy
page, changelog), be specific and concrete, not reassuring-and-vague.

## Non-goals / anti-references

- **Not a cloud service** — no accounts, no server storage, no team features. Sync,
  if used, is the user's own folder (Dropbox/OneDrive/iCloud), one device at a time, $0.
- **Cross-platform** — Windows 10/11 x64 + macOS 12+ Apple Silicon (v0.3.0+). Native bits remain platform-specific by design.
- **Not a kitchen sink** — we removed a full-disk indexer for being too heavy.
  Features must earn their place in a minimal tool.
- **No telemetry/analytics/ads/third-party SDKs** — nothing to sell.
- **Not "AI-templated"** — see the anti-pattern list in `DESIGN.md`.

## Privacy stance (core to identity)

Stored locally: Windows `%APPDATA%\mnml\mnml.sqlite` + `images/`; macOS
`~/Library/Application Support/mnml/`. mnml honors OS "do not record" clipboard
markers where available, so password managers and browser password fields are never
captured. Only outbound requests: the daily update check and a link-title fetch
(briefly visits the URL; private/local addresses blocked). Optional folder-sync
stores data in a service the user already runs, under that provider's terms; mnml
never receives it. Site sets no cookies, runs no analytics. Full policy:
[`site/privacy.html`](./site/privacy.html).

## Status (v0.2.40)

- **Public**, MIT, `github.com/syfpsy/mnml`. Site: `https://mnml.nxyz.art/`.
- **Distribution**: installer + update manifest on **GitHub Releases**; the site's
  download links redirect there. Auto-update polls the published `latest.yml` daily.
  Only the latest release is kept live.
- **Code signing**: not yet signed → SmartScreen "unrecognized app" prompt on first
  run. Submitted to **SignPath Foundation** (free OSS signing); CI signing + a switch
  of the updater to the GitHub provider follow once approved.
- **Contact**: `info@nxyz.art`.

## Standing collaboration rules (from `CLAUDE.md`)

- **Never deploy, commit, push, or tag without explicit confirmation.** Work locally; ask first.
- **Keep `CHANGELOG.md` current**; never bump a version without an entry; never write unverified notes.
- **Small, surgical changes.** Preserve architecture, naming, design language. No speculative rewrites or casual deps.
- **Verify before claiming done** (typecheck/build); report failures honestly.
