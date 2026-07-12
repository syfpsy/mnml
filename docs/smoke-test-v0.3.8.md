# v0.3.8 smoke test (Windows)

Run after building or installing from `release/mnml-setup.exe`.

## Automated (startup)

```powershell
.\scripts\smoke-test-win.ps1
```

Passes if the packaged `mnml.exe` stays alive for 6 s without crashing (native bindings load).

## Manual (interactive — ~2 min)

1. **Summon** — Alt-Alt twice; search field focused, no black flash.
2. **Search SWR** — type in search; list should not flash empty while waiting.
3. **Images** — Images tab; scroll; thumbnails appear as rows enter view.
4. **App search** — type `calc` or `settings`; results appear, icons fill in shortly after.
5. **Saved** — Saved tab; snippets load; filter works.
6. **Settings** — gear opens (lazy chunk); Esc closes sheet without hiding window.
7. **Dismiss** — Esc or click outside closes panel; Alt-Alt reopens.

Mark pass/fail in the vault repo note when done.
