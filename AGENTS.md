# AGENTS.md — mnml · start here

Cross-tool entry point for any agent (Claude Code, Codex, Cursor, Antigravity, Hermes) or human. Map + non-negotiables here; depth in `docs/`/code.

> Claude Code: `CLAUDE.md` imports this via `@AGENTS.md`. Other tools read this directly.

## What this is
mnml — a **keyboard-first clipboard manager for Windows and macOS** (Electron + TS). Alt twice (Win) / Option twice (Mac) to summon; clipboard history (text/links/images, SQLite FTS5), Ctrl+1…9 quick-paste (strips formatting), saved snippets, app + settings launcher. One 440×540 window, local SQLite, no accounts/telemetry. MIT.

## Stack
Electron · TypeScript · SQLite (FTS5) · Windows x64 · electron-builder.

## Read next
- `docs/bug-history.md` · `README.md`
- Vault: `Repo - mnml.md`

## Non-negotiables
- Local-only: no telemetry, no accounts — keep it that way.
- Quick-paste must strip formatting (always clean plain text).

## Commands
`dev` · `build` · `build:dir` · `release` · `icons`


---

## Inherits — cross-tool standard
- **Global rules:** `C:\Repos\AGENTS.md` (behavior + git/deploy/dependency/testing/secrets safety). Repo rules here win on conflict.
- **Knowledge base:** `C:\Seyfidian` -> `09 Repo Registry/Repo Map.md` -> this repo's note. Read before coding; write back after (Claude Code: `/kb:save-back`).
- **Who reads what:** Codex, Cursor, Antigravity, Hermes read this `AGENTS.md` directly; Claude Code reads it via the `CLAUDE.md` `@AGENTS.md` bridge.
