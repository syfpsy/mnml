# mnml Bug History

Concise log of bugs already fixed. Read before reintroducing similar code.

---

## Foreground / focus on Windows

These are the bugs we kept hitting because Windows protects against background apps stealing focus. Every "search box doesn't accept keystrokes after summon" complaint is in this family.

| # | Symptom | Root cause | Fix | Avoid |
|---|---|---|---|---|
| F1 | Search bar didn't auto-focus on summon (v0.2.3) | The renderer's input focus called `el.focus()` before the OS had handed focus to Electron. | Renderer adds a `window "focus"` listener that fires the input focus the instant the OS grants focus, plus an 80 ms timer fallback. | Don't rely on a single fixed-delay timer for input focus. Two-pronged: timer + focus event. |
| F2 | `win.focus()` did nothing (v0.2.6) | Electron's `BrowserWindow.focus()` is a no-op for background processes (Windows focus-steal prevention). | Main process calls `app.focus({ steal: true })` to explicitly request foreground activation. | Don't call only `win.focus()` when summoning from a background hotkey. |
| F3 | Opacity-0 + `showInactive()` had permanent HWND, focus rejected (v0.2.7) | The HWND was never truly hidden. `SetForegroundWindow` is silently rejected for already-shown windows from background processes. | Truly `win.hide()` after every dismiss; `win.show()` on each summon (hidden→shown transition). | Don't keep the HWND visible at opacity 0 between summons — Windows treats it as "shown" and refuses focus. |
| F4 | uIOhook callbacks have no foreground rights (v0.2.12) | `WH_KEYBOARD_LL` callbacks fire via libuv, not the Windows accelerator path. Windows does **not** grant foreground-activation rights to the firing thread. So even after `win.show()`, `SetForegroundWindow` is silently rejected. | Native Windows shim runs `AttachThreadInput(currentTid, foregroundTid, true)` + synthetic Alt tap + `ShowWindowAsync` + `BringWindowToTop` + `SetForegroundWindow` + `SwitchToThisWindow` + `SetFocus`. Lives in a long-running PowerShell helper process (see `WINDOWS_FOREGROUND_HELPER` in `electron/main.ts`). | Don't trust `SetForegroundWindow` from a uIOhook callback context without first calling `AttachThreadInput`. |
| F5 | Recursive double-Alt re-trigger (v0.2.15) | The native shim synthesizes an Alt key-up via `keybd_event(VK_MENU, …, KEYEVENTF_KEYUP)`. uIOhook saw it as a real Alt-up and ran the double-Alt detector again. Toggle bounced. | `installDoubleAlt` now reads a `suppressDoubleAltFor(ms)` deadline. Helper sets it before injecting Alt. Also: `runSummonFocusPass(true)` requests native foreground only **once** per summon (`nativeForegroundRequestsForShow` guard) and a `toggleLockedUntil` 650 ms guard prevents repeat-toggles on either path. | Don't synthesize keyboard events without telling your own hook to ignore them. |
| F6 | Renderer thought it was focused but window wasn't (v0.2.15) | `document.activeElement === input` was the only verification. Chromium can have a "focused" element in an inactive window. | Verification now requires **both** `document.hasFocus()` **and** `document.activeElement === input`. Search input also gets `data-mnml-search="true"` attribute for reliable selection. | Don't trust `document.activeElement` alone for "did the user actually receive focus?" — pair with `document.hasFocus()`. |
| F7 | DOM focus pass fired before window had OS focus (v0.2.13–v0.2.15) | Single attempt at a fixed delay raced the OS focus grant. | `scheduleSearchFocusVerification` retries at multiple delays (`16, 50, 100, 180, 300, 500, 800, 1200 ms`) and stops the moment verification succeeds (`focusRunId` invalidates pending retries on the next summon). | Don't pick one delay. Schedule a small staircase of retries and bail out on first success. |
| F8 | 80 ms gap between Alt key-up and `toggleWindow()` is intentional (v0.2.13) | Without it, Windows hadn't finished settling keyboard focus from the Alt release, and the show race re-emerged. | `installDoubleAlt(() => setTimeout(toggleWindow, 80))`. | Don't remove the 80 ms delay even if it "looks unnecessary". |

---

## Window flicker / flash on summon

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| V1 | Show/hide flashed (v0.1.14) | Electron's `win.show()` + `win.hide()` cycle triggered WM_PAINT each time. | Replaced with opacity 0/1 and mouse-event masking. |
| V2 | Opacity approach broke focus (see F3) | — | Reverted to `win.show()`/`win.hide()`. The focus problem is solved by the native shim (F4); we no longer need opacity tricks for flicker, because the window is now opaque (V4). |
| V3 | Transparent window flashed compositor garbage on first summon (v0.2.10–0.2.13) | `transparent: true` made DWM composite a frame at SW_SHOW with a transparent layer that briefly showed desktop behind it. | Switched to `transparent: false`, `backgroundColor: '#111111'` (or '#ffffff' for light theme), `paintWhenInitiallyHidden: true`. |
| V4 | Outer rounded gap exposed black background as a visible border (v0.2.15) | The `<div className="p-1">` outer padding + transparent-window assumption left a visible opaque-window border once the window became opaque (V3). | Removed the gap; renderer fills the entire HWND. The `check:summon` script enforces this. |

**Build-time guard:** `npm run check:summon` (runs in CI and `npm run build`) rejects builds that reintroduce known-bad patterns: `transparent: true`, opacity-based summon, missing native focus helper, missing search-focus verification.

---

## PC search

| # | Symptom | Fix |
|---|---|---|
| P1 | Live Windows Search timed out and blocked UI (v0.2.9) | Replaced live `SystemIndex` queries with a local SQLite index (`pc_entries` + `pc_entries_fts`). |
| P2 | Index didn't track file modification times (v0.2.10) | Added `modified_at` column; results sort newest first. |
| P3 | Index only covered user folders (v0.2.11) | Crawl all ready local drive letters. (This is what's now slow — see `pc-search-perf.md` brainstorm.) |
| P4 | Existing FTS rows malformed after schema change (v0.2.12) | `ensurePcFts()` rebuilds the FTS table during migration when `ftsVersion` meta key is absent. |

---

## Other

| # | Symptom | Fix |
|---|---|---|
| O1 | Image PNGs leaked when item rows were deleted (v0.2.5) | `deleteById`, `clearAll`, and `trimToMax` now also unlink the file. |
| O2 | Escape in Settings hid the whole window (v0.2.5) | Settings panel's keydown calls `e.stopImmediatePropagation()` so `app.tsx`'s global Escape handler doesn't fire. |
| O2b | O2 silently regressed: app.tsx added a global Esc→hide listener at mount, registered BEFORE the Settings sheet's listener (which only attaches on open), so bubble-phase order made the global hide fire first and the sheet's stopImmediatePropagation was too late. | Settings sheet's keydown listener now uses capture phase (`addEventListener("keydown", fn, true)`), so it runs strictly before any bubble-phase listener on window. |
| O3 | Non-ASCII link titles decoded as Latin-1 (v0.2.5) | HTTP title fetcher buffers raw bytes, decodes as UTF-8. |
| O4 | Spurious blur fired on focus acquisition (v0.1.13) | Blur guard extended to 500 ms after `windowShownAt`. |
| O5 | `autoPaste` defaulted to `false` (v0.2.3) | Default is `true`; paste intent passed through IPC explicitly. |
| O6 | `fetchTitle` SSRF guard ignored bracketed IPv6 hostnames — `URL.hostname` for IPv6 literals comes wrapped in `[...]`, so `startsWith("fc"/"fd"/"fe8"/...)` always returned false and unique-local / link-local IPv6 ranges + IPv4-mapped IPv6 slipped through. | `isPrivateHostname()` strips brackets first, then runs the prefix checks; IPv4-mapped IPv6 recurses into the IPv4 rules. |
| O7 | Clipboard monitor's `start()` ran `clipboard.readText()` + `readImage().toPNG()` to seed baselines without consulting the sensitive-content markers — a password on the clipboard at boot got SHA-1'd, breaking the "never read or hashed" promise. | `start()` checks `isClipboardConcealed()` first and leaves all baselines empty when concealed; the next non-concealed write seeds normally. |
| O8 | Tray icon alive but Alt-Alt does nothing — main process survived a renderer crash or OS hid the HWND without going through `hideWindow()`, leaving `windowVisible=true` while `win.isVisible()=false`. `toggleWindow()` trusted the flag and kept calling `hideWindow()`. | `reconcileVisibilityFlag()` before every toggle; `render-process-gone` / load-failure / unresponsive handlers reload or recreate the window; post-`show()` visibility verify + one retry; `safeSendToRenderer()` for all IPC; log `uncaughtException`/`unhandledRejection` without quitting the tray app. |
| O9 | Esc with a non-empty search query hid the window — search bar cleared the query but global Esc→hide fired on the same keypress. | Global Esc skips hide when `input[data-mnml-search]` still has text; search bar stops propagation on Escape. |
| O10 | Esc in snippet add-form label field hid the window — global Esc only exempted `<textarea>`. | Capture-phase Esc on the add form + `[data-mnml-snippet-form]` guards on global Esc and quick-paste. |
| O11 | Clear history in Settings left stale rows — DB cleared but React state untouched until next summon. | Main broadcasts `onItemsCleared` after `clearAll()`; `useItems` empties state. |
| O12 | `restoreItem()` for images set `lastImageHash` but not `lastImageSizeKey` — same-dimension replacement images could be missed for up to 4 s. | Restore syncs size key + recheck timestamp with the hash. |
| O13 | Shift-click to copy was documented but row clicks always pasted — only search Enter honoured Shift. | `items-list` / `saved-list` wire Shift-click and Shift+Enter to `onCopyOnly`. |
| O14 | Pin toggle refetched the whole list after an optimistic update — visible flicker/reorder jump. | Re-sort in-place with the DB's pinned-first order; no post-pin refetch. |
| O15 | Every in-app button click dismissed the window — frameless `blur` hid on spurious HWND focus loss from internal clicks. | Defer blur→hide with focus re-check; suppress via `before-input-event` + cursor-in-bounds on global mousedown. |
| O16 | Text restore left image on clipboard — auto-paste pasted screenshot instead of restored text. | `clipboard.clear()` before every restore write. |
| O17 | `appLaunch` IPC allowed arbitrary shell commands. | Allowlist targets against app index; quote bare commands. |
| O18 | uIOhook only started inside double-Alt install — click-outside + paste broke when hotkey failed. | Start uIOhook independently in main. |
| O19 | Auto-paste used fixed 150 ms timer, ignored foreground-restore result; stale `prevForegroundHwnd` reused. | Paste on helper ok/miss; clear HWND each summon. |
| O20 | Concealed-content guard failed open on format-query error. | Fail closed — skip capture. |
| O21 | Async `fetchTitle` emitted updates for trimmed/deleted items. | Re-check `getById` before emit. |
| O22 | Thumb LRU not evicted on monitor `trimToMax`. | Shared thumb-cache; trim returns deleted ids. |
| O23 | `onItemUpdated` listeners leaked on tab toggle. | Return unsubscribe from effect. |
| O24 | Stale search rows during debounce — wrong quick-paste/Enter targets. | Clear list + `searchPending` guard. |
| O25 | Settings Tab focus escaped to Update banner. | Focus trap on sheet. |
| O26 | Pin reorder left wrong keyboard highlight. | Reset focus on pin order change. |
| O27 | First summon skipped sync refetch race. | Read storage on each show. |
| O28 | Clicking a row reopened mnml instead of pasting — helper emitted `prev` during `focus mnml` after `win.show()`, so `prevForegroundHwnd` pointed at mnml and auto-paste restored ourselves. | `capture` before `win.show()`; `focus` no longer overwrites prev; skip restore-to-self. |
| O29 | Esc during summon still showed the window — late `capture` callback ran after hide. | `cancelCapturePrev()` on hide/reset; ignore `prev` when no pending capture. |
| O30 | Second `hideWindow()` without paste cleared `pasteAfterRestorePending` mid-restore. | Only cancel paste timers when `!pastePending`. |
| O31 | Summon `focus-ok` raced paste-restore and fired Ctrl+V early. | Helper emits `focus-ok` / `restore-ok`; handler only pastes on `restore-*`. |
| O32 | `searchPending` stuck after search IPC error or stale completion. | `try/catch/finally` in `use-items`. |
| O33 | Rapid delete used closure snapshot — wrong row reappeared. | Functional `setItems` filter; refetch on IPC failure. |
| O34 | Image restore skipped path guard / pasted preview when PNG missing. | `assertResolvedWithinBase`; fail closed on missing image. |
| O35 | `autoPaste` setting ignored after atomic activate. | `finishActivate()` gates `setPastePending` on setting; always hides on activate. |

---

## Patterns we keep relearning

1. **Windows foreground rules are non-negotiable.** Background processes cannot focus their own windows from a uIOhook callback without `AttachThreadInput`. There is no Electron API that hides this from you.
2. **Focus verification needs `document.hasFocus()` + `activeElement === target`, not either alone.**
3. **Synthesizing input events means your own hooks need a suppression window.**
4. **Don't pick one delay — pick a staircase.** Windows focus arrival timing varies wildly.
5. **Opacity tricks for flicker are incompatible with focus tricks for activation.** Pick one strategy: opaque window + native shim is what we settled on.
6. **The `check:summon` build script exists because we keep regressing.** When in doubt, run it.
7. **Bubble-phase order ≠ DOM order.** When a modal needs to suppress a global window-level handler with `stopImmediatePropagation`, attach in **capture phase** (`addEventListener(type, fn, true)`). Registration order alone is fragile: a global listener attached at app mount will always run before a modal's listener attached on open, no matter the source-file ordering.
8. **Privacy / SSRF guards must run on every code path that touches the input, not just the most-trafficked one.** Both regressions in this round were "we added the check on path A but missed path B": the sensitive-content guard covered `poll()` but not `start()`, and the IPv6 SSRF guard covered the bare-form check but not the `URL.hostname`-bracketed form Node actually hands you.
9. **Tray apps must survive renderer death.** If the main process only logs a crash and keeps the tray icon, users perceive "mnml is running but won't open." Recover by recreating/reloading the `BrowserWindow`, and never trust a logical visibility flag without reconciling against `win.isVisible()`.
10. **React `stopPropagation` does not reliably suppress native `window` listeners.** Inline editors that must block global hotkeys need capture-phase native listeners (Settings, snippet add form) or explicit guards in the global handler that inspect `document.activeElement`.
