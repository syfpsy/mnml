import { app, BrowserWindow, globalShortcut, screen, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { uIOhook } from "uiohook-napi";
import { autoUpdater } from "electron-updater";
import { getDb } from "./db/index.js";
import { getSetting } from "./db/settings.js";
import { installDoubleAlt, suppressDoubleAltFor } from "./hotkey/double-alt.js";
import { onNewItem, onItemUpdated, start as startMonitor, stop as stopMonitor } from "./clipboard/monitor.js";
import { closeDb } from "./db/index.js";
import { IPC } from "./ipc-channels.js";
import { registerIpc } from "./ipc.js";
import { rebuildAppIndex } from "./search/app-search.js";
import { log, logPathForDisplay } from "./utils/log.js";
import { FALLBACK_SHORTCUT, IS_MAC, IS_WIN, PLATFORM_UI } from "./platform/config.js";
import { triggerPaste } from "./platform/paste.js";
import { ForegroundService } from "./platform/foreground.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.DIST          = path.join(__dirname, "../dist");
process.env.DIST_ELECTRON = __dirname;
process.env.VITE_PUBLIC   = app.isPackaged
  ? process.env.DIST!
  : path.join(process.env.DIST_ELECTRON, "../public");

const DEV_URL = process.env["VITE_DEV_SERVER_URL"];

const WINDOW_SIZE = { width: 440, height: 540 };

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let uninstallHotkey: (() => void) | null = null;
let blurLocked  = false;
let pastePending = false;
let rendererReady = false;
let showWhenReady = false;
let loggedSearchFocusForShow = false;
let loggedNativeFocusForShow = false;
let nativeForegroundRequestsForShow = 0;
let toggleLockedUntil = 0;
let focusRunId = 0;
let updaterInterval: NodeJS.Timeout | null = null;
let fg: ForegroundService | null = null;
/**
 * Opaque foreground target captured before win.show() — Win32 HWND decimal
 * string on Windows, `pid:<n>` on macOS. Used to restore focus for auto-paste.
 */
let prevForegroundTarget: string | null = null;
/** True while waiting for helper "ok"/"miss" after a `restore <hwnd>` request. */
let awaitingHelperRestore = false;
/** Paste is armed but waiting for foreground restore to complete. */
let pasteAfterRestorePending = false;
let pasteAfterRestoreTimer: NodeJS.Timeout | null = null;
/** True from paste-arming hide until Ctrl+V fires — blocks blur/outside from canceling restore. */
let pasteFlowActive = false;
/** Failsafe if restore/paste stalls — clears pasteFlowActive so dismiss works again. */
let pasteFlowSafetyTimer: NodeJS.Timeout | null = null;
/** Polls for focus loss when blur/mousedown paths miss (always-on-top edge cases). */
let focusWatchTimer: NodeJS.Timeout | null = null;

/**
 * Tracks whether the window is logically visible.
 * The renderer stays loaded while hidden; showWindow() handles the
 * hidden->shown transition needed for reliable Windows foreground focus.
 */
let windowVisible = false;

/** Timestamp set by showWindow(); used to debounce spurious blur/mousedown. */
let windowShownAt = 0;

/** Set in before-quit so an unexpected `closed` event doesn't respawn a window. */
let appQuitting = false;

/** Guard against recreate storms when the renderer keeps dying. */
let recreateAttempts = 0;
let recreateInProgress = false;
let pendingShowAfterRecreate = false;
/** Per-window load retries after did-fail-load. Reset on successful load. */
let loadRetryCount = 0;
/** Post-show() visibility verify — at most one self-retry before recreate. */
let showVerifyAttempts = 0;

/** Suppress blur→hide while an in-window pointer interaction is in flight. */
let suppressBlurHideUntil = 0;
let blurHideTimer: NodeJS.Timeout | null = null;

const MAX_LOAD_RETRIES = 2;
const MAX_RECREATE_ATTEMPTS = 5;
const RECREATE_BACKOFF_MS = 60_000;

// Log main-process fatals but keep the tray + hotkey alive — quitting on every
// stray exception is how users end up with "mnml is in the tray but dead."
process.on("uncaughtException", (err) => {
  log("[fatal] uncaughtException:", err instanceof Error ? err.stack ?? err.message : String(err));
});
process.on("unhandledRejection", (reason) => {
  log("[fatal] unhandledRejection:", reason instanceof Error ? reason.stack ?? reason.message : String(reason));
});

/* ── Window health / recovery ─────────────────────────────────────────────── */

function isWindowUsable(): boolean {
  return !!win && !win.isDestroyed() && !win.webContents.isDestroyed();
}

function resetWindowRuntimeState() {
  windowVisible = false;
  rendererReady = false;
  blurLocked = false;
  focusRunId += 1;
  showWhenReady = false;
  loggedSearchFocusForShow = false;
  loggedNativeFocusForShow = false;
  nativeForegroundRequestsForShow = 0;
  cancelScheduledBlurHide();
  suppressBlurHideUntil = 0;
  cancelCapturePrev();
  stopFocusWatchdog();
  cancelInFlightPaste();
}

function safeSendToRenderer(channel: string, payload?: unknown) {
  if (!isWindowUsable()) return;
  try {
    if (payload === undefined) win!.webContents.send(channel);
    else win!.webContents.send(channel, payload);
  } catch (err) {
    log("[ipc] send failed:", channel, String(err));
  }
}

/**
 * The logical `windowVisible` flag can drift from the OS HWND state when
 * Windows hides/minimizes us without going through hideWindow(), or when a
 * show() is rejected without throwing. If we trust the flag alone, Alt-Alt
 * can call hideWindow() while the HWND is already gone — then the next
 * Alt-Alt thinks we're hidden and show() no-ops, leaving a tray icon with
 * no summonable overlay.
 */
function reconcileVisibilityFlag() {
  if (!isWindowUsable()) {
    if (windowVisible) {
      log("[window] visibility flag reset — window handle gone");
      windowVisible = false;
    }
    return;
  }
  const osVisible = win!.isVisible();
  if (windowVisible !== osVisible) {
    log("[window] visibility desync reconciled", { flag: windowVisible, os: osVisible });
    windowVisible = osVisible;
  }
}

function destroyWindowSafe() {
  if (!win) return;
  try {
    if (!win.isDestroyed()) win.destroy();
  } catch (err) {
    log("[window] destroy failed:", String(err));
  }
  win = null;
  resetWindowRuntimeState();
}

function recreateWindow(showAfter = false) {
  if (recreateInProgress) {
    pendingShowAfterRecreate = pendingShowAfterRecreate || showAfter;
    return;
  }
  recreateAttempts += 1;
  if (recreateAttempts > MAX_RECREATE_ATTEMPTS) {
    log("[window] recreate backoff — too many attempts");
    setTimeout(() => { recreateAttempts = 0; }, RECREATE_BACKOFF_MS);
    return;
  }

  recreateInProgress = true;
  log("[window] recreating BrowserWindow", { showAfter, attempt: recreateAttempts });
  loadRetryCount = 0;
  destroyWindowSafe();
  try {
    createWindow();
    if (showAfter) showWhenReady = true;
  } catch (err) {
    log("[window] recreate failed:", String(err));
  } finally {
    recreateInProgress = false;
    if (pendingShowAfterRecreate) {
      pendingShowAfterRecreate = false;
      showWhenReady = true;
    }
  }
}

function safeReloadRenderer(): boolean {
  if (!isWindowUsable()) return false;
  try {
    if (win!.webContents.isLoading()) return false;
    rendererReady = false;
    win!.webContents.reload();
    log("[renderer] reload requested");
    return true;
  } catch (err) {
    log("[renderer] reload failed:", String(err));
    return false;
  }
}

/* ── Click-outside + blur-dismiss ─────────────────────────────────────────── */

function cancelScheduledBlurHide() {
  if (blurHideTimer !== null) {
    clearTimeout(blurHideTimer);
    blurHideTimer = null;
  }
}

/** In-window clicks (tabs, pin, settings, …) can briefly blur the HWND on
 *  Windows frameless overlays. Mark them so the deferred blur handler
 *  doesn't treat every button press as "click away". */
function markInternalPointerDown(ms = 1_000) {
  suppressBlurHideUntil = Math.max(suppressBlurHideUntil, Date.now() + ms);
  cancelScheduledBlurHide();
}

/** Renderer calls this on mousedown in tabs, lists, etc. before HWND blur fires. */
function suppressBlurHideFromRenderer() {
  markInternalPointerDown(1_200);
  setImmediate(() => {
    if (!windowVisible || !isWindowUsable()) return;
    try {
      win!.focus();
      win!.webContents.focus();
    } catch { /* noop */ }
  });
}

function normalizeHookPoint(x: number, y: number): { x: number; y: number } {
  // uIOhook reports physical screen pixels on Windows; getBounds() is DIP.
  if (IS_WIN) {
    try {
      return screen.screenToDipPoint({ x, y });
    } catch { /* fall through */ }
  }
  return { x, y };
}

function isPointInsideWindow(x?: number, y?: number): boolean {
  if (!isWindowUsable() || !win!.isVisible()) return false;
  const point = x != null && y != null
    ? normalizeHookPoint(x, y)
    : screen.getCursorScreenPoint();
  const b = win!.getBounds();
  return (
    point.x >= b.x && point.x <= b.x + b.width &&
    point.y >= b.y && point.y <= b.y + b.height
  );
}

function cancelInFlightPaste() {
  if (pasteAfterRestoreTimer !== null) {
    clearTimeout(pasteAfterRestoreTimer);
    pasteAfterRestoreTimer = null;
  }
  if (pasteFlowSafetyTimer !== null) {
    clearTimeout(pasteFlowSafetyTimer);
    pasteFlowSafetyTimer = null;
  }
  pasteAfterRestorePending = false;
  awaitingHelperRestore = false;
  pasteFlowActive = false;
}

function armPasteFlowSafety() {
  if (pasteFlowSafetyTimer !== null) clearTimeout(pasteFlowSafetyTimer);
  pasteFlowSafetyTimer = setTimeout(() => {
    pasteFlowSafetyTimer = null;
    if (!pasteFlowActive) return;
    log("[paste] safety timeout — clearing stalled paste flow");
    cancelInFlightPaste();
  }, 2_500);
}

function stopFocusWatchdog() {
  if (focusWatchTimer !== null) {
    clearInterval(focusWatchTimer);
    focusWatchTimer = null;
  }
}

function startFocusWatchdog() {
  stopFocusWatchdog();
  focusWatchTimer = setInterval(() => {
    if (!windowVisible || blurLocked || !isWindowUsable()) return;
    if (pastePending || pasteFlowActive || pasteAfterRestorePending || awaitingHelperRestore) return;
    if (Date.now() < suppressBlurHideUntil) return;
    if (Date.now() - windowShownAt < 500) return;
    if (win!.isFocused() || win!.webContents.isFocused()) return;
    if (BrowserWindow.getFocusedWindow() === win) return;
    if (win!.webContents.isDevToolsOpened()) return;
    // Do not gate on cursor position — Alt-Tab away leaves the pointer over
    // the always-on-top panel while focus is already gone (O38).
    log("[focus-watch] hiding — focus left the window");
    hideWindow();
  }, 250);
}

function scheduleBlurHide() {
  cancelScheduledBlurHide();
  blurHideTimer = setTimeout(() => {
    blurHideTimer = null;
    if (blurLocked || !windowVisible || !isWindowUsable()) return;
    if (pastePending || pasteFlowActive || pasteAfterRestorePending || awaitingHelperRestore) return;
    if (Date.now() < suppressBlurHideUntil) return;
    if (Date.now() - windowShownAt < 500) return;
    // Transient blur from an internal click — focus never actually left.
    if (win!.isFocused() || win!.webContents.isFocused()) return;
    if (BrowserWindow.getFocusedWindow() === win) return;
    if (win!.webContents.isDevToolsOpened()) return;
    log("[blur] hiding — focus left the window");
    hideWindow();
  }, 250);
}

function onGlobalMouseOutside(e: { x: number; y: number }, source: "mousedown" | "mouseup") {
  if (!isWindowUsable() || !windowVisible || blurLocked) return;
  if (pastePending || pasteFlowActive || pasteAfterRestorePending || awaitingHelperRestore) return;
  if (Date.now() - windowShownAt < 350) return; // ignore the opening click
  // Cursor is authoritative — hook x/y can disagree with DIP bounds on HiDPI.
  if (isPointInsideWindow() || isPointInsideWindow(e.x, e.y)) {
    markInternalPointerDown();
    return;
  }
  log(`[mouse] outside ${source} — hiding`);
  hideWindow();
}

const onGlobalMousedownHandler = (e: { x: number; y: number }) =>
  onGlobalMouseOutside(e, "mousedown");
const onGlobalMouseupHandler = (e: { x: number; y: number }) =>
  onGlobalMouseOutside(e, "mouseup");

function clearPasteAfterRestoreTimer() {
  if (pasteAfterRestoreTimer !== null) {
    clearTimeout(pasteAfterRestoreTimer);
    pasteAfterRestoreTimer = null;
  }
}

function onForegroundRestoreComplete(settleMs: number) {
  pasteAfterRestorePending = false;
  clearPasteAfterRestoreTimer();
  triggerPaste(settleMs, () => { pasteFlowActive = false; });
}

function createForegroundService(): ForegroundService {
  const service = new ForegroundService(() => win, {
    onFocusOk: () => {
      if (!loggedNativeFocusForShow) {
        loggedNativeFocusForShow = true;
        log(IS_MAC ? "[focus] macOS foreground focused" : "[focus] windows foreground focused");
      }
      scheduleSearchFocusVerification("native-foreground", [0, 16, 50, 120, 240]);
    },
    onFocusMiss: () => { /* noop */ },
    onRestoreOk: () => {
      if (!awaitingHelperRestore) return;
      awaitingHelperRestore = false;
      if (pasteAfterRestorePending) onForegroundRestoreComplete(80);
    },
    onRestoreMiss: () => {
      if (!awaitingHelperRestore) return;
      awaitingHelperRestore = false;
      if (pasteAfterRestorePending) onForegroundRestoreComplete(400);
    },
  });
  service.onPrevCaptured = (target) => {
    prevForegroundTarget = service.sanitizePrevTarget(target);
  };
  return service;
}

function setPastePending() {
  pastePending = true;
  markInternalPointerDown(800);
}

function cancelCapturePrev() {
  fg?.cancelCapture();
}

function requestCapturePrev(onDone: () => void) {
  fg?.requestCapturePrev(onDone);
}

function requestNativeForeground() {
  if (!win || win.isDestroyed()) return;
  if (nativeForegroundRequestsForShow >= 1) return;
  nativeForegroundRequestsForShow += 1;
  suppressDoubleAltFor(IS_WIN ? 1_200 : 400);
  fg?.requestNativeForeground();
}

function requestRestoreForeground(target: string) {
  suppressDoubleAltFor(600);
  awaitingHelperRestore = true;
  fg?.requestRestoreForeground(target);
}

function focusWindowNow(native = false) {
  if (!win || win.isDestroyed()) return;
  win.setFocusable(true);
  app.focus({ steal: true });
  win.moveTop();
  win.focus();
  win.webContents.focus();
  if (native) requestNativeForeground();
}

interface SearchFocusResult {
  inputFound: boolean;
  documentFocused: boolean;
  focused: boolean;
  activeElement: string | null;
}

function isSearchFocusResult(value: unknown): value is SearchFocusResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.inputFound === "boolean" &&
    typeof result.documentFocused === "boolean" &&
    typeof result.focused === "boolean" &&
    (typeof result.activeElement === "string" || result.activeElement === null)
  );
}

const FOCUS_SEARCH_SCRIPT = `
(() => {
  const input = document.querySelector("input[data-mnml-search='true']");
  const activeElement = document.activeElement;
  if (!(input instanceof HTMLInputElement)) {
    return {
      inputFound: false,
      documentFocused: document.hasFocus(),
      focused: false,
      activeElement: activeElement ? activeElement.tagName : null,
    };
  }
  input.focus({ preventScroll: true });
  input.select();
  return {
    inputFound: true,
    documentFocused: document.hasFocus(),
    focused: document.hasFocus() && document.activeElement === input,
    activeElement: document.activeElement ? document.activeElement.tagName : null,
  };
})()
`;

function focusSearchInputNow(): Promise<boolean> {
  if (!win || win.isDestroyed() || !rendererReady) return Promise.resolve(false);
  return win.webContents
    .executeJavaScript(FOCUS_SEARCH_SCRIPT, true)
    .then((result: unknown) => {
      if (!isSearchFocusResult(result)) {
        log("[focus] search input verification returned invalid result");
        return false;
      }

      if (result.focused) {
        if (!loggedSearchFocusForShow) {
          loggedSearchFocusForShow = true;
          log("[focus] search input focused");
        }
        return true;
      }

      return false;
    })
    .catch((err) => {
      log("[focus] search input focus failed:", String(err));
      return false;
    });
}

function scheduleSearchFocusVerification(_reason: string, delays: number[]) {
  if (!win || win.isDestroyed() || !rendererReady || !windowVisible) return;
  const runId = focusRunId;

  for (const delay of delays) {
    setTimeout(() => {
      if (
        runId !== focusRunId ||
        !win ||
        win.isDestroyed() ||
        !rendererReady ||
        !windowVisible ||
        loggedSearchFocusForShow
      ) {
        return;
      }

      void focusSearchInputNow();
    }, delay);
  }
}

function runSummonFocusPass(native = false) {
  focusWindowNow(native);
  void focusSearchInputNow();
}

/* ── Tray icon ───────────────────────────────────────────────────────────────
 * Loads the multi-resolution `build/icon.ico` (7 embedded sizes: 16, 24, 32,
 * 48, 64, 128, 256). Windows picks the appropriate size for the current DPI
 * scaling — a single 16×16 PNG would upscale-blur on HiDPI tray slots
 * (24/32/48 actual pixels at 150-200 % scaling).
 *
 * Falls back to the single 16-px PNG, then a 1×1 transparent placeholder,
 * so the tray-init path never crashes even if asset packaging breaks.
 */
function createTrayIcon(): Electron.NativeImage {
  const buildDir = app.isPackaged
    ? path.join(process.resourcesPath, "build")
    : path.join(__dirname, "..", "build");
  for (const candidate of [
    path.join(buildDir, IS_MAC ? "icon-512.png" : "icon.ico"),
    path.join(buildDir, "tray.png"),
  ]) {
    if (fs.existsSync(candidate)) {
      return nativeImage.createFromPath(candidate);
    }
  }
  log("[tray] no icon asset found in", buildDir, "— using transparent placeholder");
  return nativeImage.createFromBitmap(Buffer.alloc(4, 0), { width: 1, height: 1, scaleFactor: 1.0 });
}

function buildTrayMenu(updateVersion?: string) {
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: "Show / Hide", click: () => toggleWindow() },
    { type: "separator" },
  ];
  if (updateVersion) {
    items.push(
      { label: `Restart to update  (v${updateVersion})`, click: () => {
          autoUpdater.quitAndInstall(false, true);
        },
      },
      { type: "separator" },
    );
  }
  items.push({ label: "Quit mnml", click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

function createTray(): Tray {
  const t = new Tray(createTrayIcon());
  t.setToolTip(`mnml — clipboard manager\n${PLATFORM_UI.summonHint} to show/hide`);
  t.setContextMenu(buildTrayMenu());
  t.on("click", () => toggleWindow());
  return t;
}

/* ── Auto-updater ──────────────────────────────────────────────────────────── */
function setupAutoUpdater() {
  // Silence the default logger; route through our log util.
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    log("[updater] checking for update");
  });

  autoUpdater.on("update-available", (info) => {
    log("[updater] update available:", info.version);
    safeSendToRenderer(IPC.onUpdateAvailable, info.version);
    tray?.setToolTip(`mnml — update v${info.version} downloading…`);
  });

  autoUpdater.on("update-not-available", () => {
    log("[updater] already up to date");
  });

  autoUpdater.on("download-progress", (p) => {
    log(`[updater] download ${Math.round(p.percent)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log("[updater] ready to install:", info.version);
    safeSendToRenderer(IPC.onUpdateDownloaded, info.version);
    tray?.setToolTip(`mnml — update v${info.version} ready`);
    tray?.setContextMenu(buildTrayMenu(info.version));
  });

  autoUpdater.on("error", (err) => {
    log("[updater] error:", err.message);
  });

  // Check on startup, then once a day for long-running instances. Was every
  // 4 h, but the network round-trip wasn't doing anything useful between
  // checks. Handle is stored so `before-quit` can clear it.
  const check = () =>
    autoUpdater.checkForUpdates().catch((err) =>
      log("[updater] check failed:", err.message),
    );
  check();
  if (updaterInterval) clearInterval(updaterInterval);
  updaterInterval = setInterval(check, 24 * 60 * 60 * 1000);
}

/* ── Window positioning ────────────────────────────────────────────────────── */
function positionNearCursor(w: number, h: number): { x: number; y: number } {
  const cursor  = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { workArea } = display;
  const GAP = 8;
  // Anchor top-left corner at cursor; flip left or up when near screen edge.
  let x = cursor.x;
  let y = cursor.y;
  if (x + w > workArea.x + workArea.width  - GAP) x = cursor.x - w;
  if (y + h > workArea.y + workArea.height - GAP) y = cursor.y - h;
  x = Math.max(workArea.x + GAP, Math.min(x, workArea.x + workArea.width  - w - GAP));
  y = Math.max(workArea.y + GAP, Math.min(y, workArea.y + workArea.height - h - GAP));
  return { x: Math.round(x), y: Math.round(y) };
}

function windowBackgroundColor(): string {
  // Must mirror the `--bg` CSS variable in `src/styles.css` (warm/cool
  // tinted neutrals, not pure black/white). Mismatch causes a first-paint
  // flash before the renderer's CSS attaches.
  return getSetting("lightTheme") ? "#fafaf8" : "#0e0f12";
}

/* ── Window lifecycle ──────────────────────────────────────────────────────── */
function createWindow() {
  const size     = WINDOW_SIZE;
  const { x, y } = positionNearCursor(size.width, size.height);

  // BrowserWindow's `icon` is what Windows uses for the title-bar icon and
  // the Alt-Tab thumbnail badge. The executable's icon (taskbar / Start
  // Menu / file Explorer) is set separately via electron-builder's
  // `win.icon`. Both point at the same multi-resolution ICO so the brand
  // mark is consistent everywhere Windows renders it.
  const buildDir = app.isPackaged
    ? path.join(process.resourcesPath, "build")
    : path.join(__dirname, "..", "build");
  const winIconPath = IS_MAC
    ? path.join(buildDir, "icon-512.png")
    : path.join(buildDir, "icon.ico");

  win = new BrowserWindow({
    ...size,
    x, y,
    icon:        fs.existsSync(winIconPath) ? winIconPath : undefined,
    show:        false,
    frame:       false,
    transparent: false,
    resizable:   false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow:   true,
    backgroundColor: windowBackgroundColor(),
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload:          path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  win.setMenu(null);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.on("closed", () => {
    log("[window] closed");
    win = null;
    resetWindowRuntimeState();
    // recreateWindow() already respawns; don't double-create.
    if (!appQuitting && !recreateInProgress) {
      log("[window] unexpected close — respawning for hotkey");
      setImmediate(() => {
        try { createWindow(); }
        catch (err) { log("[window] respawn after close failed:", String(err)); }
      });
    }
  });

  win.on("unresponsive", () => {
    log("[renderer] unresponsive — attempting reload");
    if (!safeReloadRenderer()) recreateWindow(windowVisible);
  });

  win.on("responsive", () => {
    log("[renderer] responsive again");
  });

  // Diagnostics + self-heal
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    log("[renderer] did-fail-load", code, desc, url);
    if (!isMainFrame || !isWindowUsable()) return;
    if (loadRetryCount >= MAX_LOAD_RETRIES) {
      log("[renderer] load failed permanently — recreating window");
      recreateWindow(windowVisible || showWhenReady);
      return;
    }
    loadRetryCount += 1;
    setTimeout(() => {
      if (!isWindowUsable()) return;
      log("[renderer] reloading after failed load, attempt", loadRetryCount);
      safeReloadRenderer();
    }, 400);
  });
  win.webContents.on("console-message", (_e, level, msg, line, src) => {
    if (level >= 2) log("[renderer] console", level, msg, `${src}:${line}`);
  });
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "mouseDown" || input.type === "mouseUp") {
      markInternalPointerDown();
    }
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    log("[renderer] render-process-gone:", details.reason, "exitCode=", details.exitCode);
    const shouldShow = windowVisible || showWhenReady;
    recreateWindow(shouldShow);
  });

  // Blur: hide when the user Alt-Tabs or clicks away, but only after the
  // window has had time to acquire focus (guards against Windows' focus-deny
  // race that used to cause an immediate hide right after show). Deferred +
  // re-checked so in-window button clicks (which can spuriously blur the HWND
  // on frameless Windows overlays) don't dismiss the panel.
  win.on("blur", () => {
    if (blurLocked || !windowVisible) return;
    if (Date.now() - windowShownAt < 500) return;
    if (!isWindowUsable()) return;
    scheduleBlurHide();
  });
  win.on("focus", () => {
    cancelScheduledBlurHide();
    if (!windowVisible) return;
    scheduleSearchFocusVerification("window-focus", [0, 16, 50, 120, 240]);
  });

  // Pass the persisted `lightTheme` setting via a query param so the
  // renderer's inline boot script can apply the class to <html> BEFORE
  // first paint. Sync SQLite read here is fine — no I/O concern at the
  // window-create stage. Result: no flash of the wrong palette when a
  // light-theme user summons the window.
  const lightTheme = Boolean(getSetting("lightTheme"));
  const themeQuery = `?theme=${lightTheme ? "light" : "dark"}`;
  if (DEV_URL) {
    win.loadURL(DEV_URL + themeQuery);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(process.env.DIST!, "index.html"), { search: themeQuery });
  }

  // The renderer loads while the OS window stays hidden. Keeping the native
  // window truly hidden between summons gives the next hidden->shown transition
  // the best chance of foreground activation on Windows.
  win.webContents.once("did-finish-load", () => {
    if (!isWindowUsable()) return;
    loadRetryCount = 0;
    recreateAttempts = 0;
    rendererReady = true;
    try { win!.setIgnoreMouseEvents(true, { forward: true }); }
    catch (err) { log("[window] setIgnoreMouseEvents failed:", String(err)); }
    log("[startup] renderer ready");
    if (showWhenReady) {
      showWhenReady = false;
      showWindow();
    }
  });
}

function showWindow() {
  if (!isWindowUsable()) {
    log("[show] window missing — recreating");
    recreateWindow(true);
    return;
  }
  reconcileVisibilityFlag();

  if (!rendererReady) {
    showWhenReady = true;
    return;
  }
  if (windowVisible && win!.isVisible()) {
    focusRunId += 1;
    loggedSearchFocusForShow = false;
    loggedNativeFocusForShow = false;
    nativeForegroundRequestsForShow = 0;
    runSummonFocusPass(true);
    scheduleSearchFocusVerification("visible-window", [16, 50, 120, 240, 420]);
    safeSendToRenderer(IPC.onVisibilityChanged, true);
    startFocusWatchdog();
    return;
  }

  const revealWindow = () => {
    const size     = WINDOW_SIZE;
    const { x, y } = positionNearCursor(size.width, size.height);

    try {
      win!.setBounds({ ...size, x, y }, false);
      win!.setAlwaysOnTop(true, "screen-saver");
      win!.setFocusable(true);
    } catch (err) {
      log("[show] pre-show setup failed:", String(err));
      recreateWindow(true);
      return;
    }

    windowShownAt = Date.now();
    windowVisible = true;
    showVerifyAttempts = 0;
    focusRunId += 1;
    loggedSearchFocusForShow = false;
    loggedNativeFocusForShow = false;
    nativeForegroundRequestsForShow = 0;
    try { win!.setIgnoreMouseEvents(false); }
    catch (err) { log("[show] setIgnoreMouseEvents(false) failed:", String(err)); }

    try {
      win!.show();
    } catch (err) {
      log("[show] win.show() threw:", String(err));
      windowVisible = false;
      recreateWindow(true);
      return;
    }
    runSummonFocusPass(true);
    scheduleSearchFocusVerification("show", [16, 50, 100, 180, 300, 500, 800, 1_200]);

    setImmediate(() => {
      if (!isWindowUsable() || !windowVisible) return;
      safeSendToRenderer(IPC.onVisibilityChanged, true);
    });

    setTimeout(() => {
      if (!windowVisible || !isWindowUsable()) return;
      if (!win!.isVisible()) {
        if (showVerifyAttempts >= 1) {
          log("[show] still hidden after retry — recreating window");
          windowVisible = false;
          recreateWindow(true);
          return;
        }
        showVerifyAttempts += 1;
        log("[show] still hidden after show() — retrying once");
        windowVisible = false;
        showWindow();
      }
    }, 150);

    log("[show] window shown at", { x, y, ...size });
    startFocusWatchdog();
  };

  // Capture the app the user was in *before* win.show() steals foreground.
  prevForegroundTarget = null;
  requestCapturePrev(revealWindow);
}

function hideWindow() {
  cancelScheduledBlurHide();
  cancelCapturePrev();
  const armingPaste = pastePending;
  // A non-paste hide (Esc, click-outside) must not tear down an in-flight
  // restore→paste started by a row click a moment earlier — but *do* cancel
  // when the user explicitly dismisses without arming a new paste.
  if (!armingPaste && !pasteFlowActive) {
    cancelInFlightPaste();
  }
  if (!isWindowUsable()) {
    resetWindowRuntimeState();
    return;
  }
  blurLocked    = false;
  windowVisible = false;
  focusRunId += 1;
  stopFocusWatchdog();

  try { win!.setIgnoreMouseEvents(true, { forward: true }); }
  catch (err) { log("[hide] setIgnoreMouseEvents failed:", String(err)); }

  // Notify renderer
  safeSendToRenderer(IPC.onVisibilityChanged, false);

  if (armingPaste) {
    pasteFlowActive = true;
    suppressDoubleAltFor(1_200);
    armPasteFlowSafety();
    // Auto-paste path. Old approach was just blur + hide + setTimeout(paste,
    // 300ms), trusting Windows to give focus back to the previous app. It
    // didn't — Windows can promote any window in z-order, and the Ctrl+V
    // would land on the wrong app (often Explorer or an alwaysOnTop tool).
    //
    // New sequence:
    //   1. Hide mnml.
    //   2. Ask the foreground helper to SetForegroundWindow on the HWND we
    //      captured *before* the summon (saved as `prevForegroundHwnd`).
    //   3. After a short settle delay, synthesize Ctrl+V via uIOhook into
    //      whatever window currently has foreground — which is now the
    //      previous app.
    pastePending = false;
    try { win!.hide(); } catch (err) { log("[hide] win.hide() failed:", String(err)); }
    const target = prevForegroundTarget;
    const ours = fg?.ownTarget() ?? null;
    if (target && ours && target === ours) {
      try { win!.blur(); } catch { /* noop */ }
      triggerPaste(300, () => { pasteFlowActive = false; });
    } else if (target) {
      pasteAfterRestorePending = true;
      requestRestoreForeground(target);
      if (pasteAfterRestoreTimer !== null) clearTimeout(pasteAfterRestoreTimer);
      pasteAfterRestoreTimer = setTimeout(() => {
        pasteAfterRestoreTimer = null;
        if (!pasteAfterRestorePending) return;
        pasteAfterRestorePending = false;
        awaitingHelperRestore = false;
        log("[paste] restore timed out — pasting anyway");
        triggerPaste(120, () => { pasteFlowActive = false; });
      }, 750);
    } else {
      try { win!.blur(); } catch { /* noop */ }
      triggerPaste(350, () => { pasteFlowActive = false; });
    }
  } else {
    // Normal hide (Escape / click-outside).
    // Truly hide so the next showWindow() operates on a hidden HWND and gets
    // OS focus unconditionally via ShowWindow(SW_SHOW).
    try { win!.hide(); } catch (err) { log("[hide] win.hide() failed:", String(err)); }
  }
}

function toggleWindow() {
  if (!isWindowUsable()) {
    log("[toggle] window missing — recreating and showing");
    recreateWindow(true);
    return;
  }
  reconcileVisibilityFlag();

  const now = Date.now();
  if (now < toggleLockedUntil) {
    log("[toggle] ignored repeat");
    return;
  }
  toggleLockedUntil = now + 650;
  if (!windowVisible && (pasteFlowActive || pasteAfterRestorePending || awaitingHelperRestore || pastePending)) {
    log("[toggle] ignored show during paste flow");
    return;
  }
  if (windowVisible) { log("[toggle] hiding");  hideWindow();  return; }
  log("[toggle] showing");
  showWindow();
}

function setBlurLock(locked: boolean) { blurLocked = locked; }

/* ── Auto-launch sync ───────────────────────────────────────────────────────
 * Belt-and-suspenders for the "Launch on startup" setting. Runs on every
 * boot AND every time the user toggles the setting via the Settings panel
 * (the toggle's IPC handler also calls `app.setLoginItemSettings`; this
 * function corrects any drift in the other direction).
 *
 * Drift cases this handles:
 *   - Default ON for new installs: setting=true (DB row absent → returns
 *     DEFAULTS.launchOnStartup=true), registry=false. We add the Run entry.
 *   - Cleanup tools removed our HKCU\…\Run entry (CCleaner, Autoruns,
 *     manual reg edit, Windows reset): setting=true, registry=false. We
 *     re-add.
 *   - User explicitly toggled OFF: setting=false, registry=false. No-op.
 *   - User toggled OFF via mnml but registry still has the entry (race
 *     during update / reinstall): setting=false, registry=true. We remove.
 *
 * On Windows, `setLoginItemSettings` writes to HKEY_CURRENT_USER\Software\
 * Microsoft\Windows\CurrentVersion\Run with the entry name = app productName
 * (`mnml`). Re-running with the same arguments is idempotent.
 */
function syncLoginItemWithSetting() {
  try {
    const desired = Boolean(getSetting("launchOnStartup"));
    const current = app.getLoginItemSettings().openAtLogin;
    if (current === desired) return;
    app.setLoginItemSettings({ openAtLogin: desired });
    log(`[startup] login item drift corrected: registry ${current} → ${desired}`);
  } catch (err) {
    // Worst case: we don't auto-start. The user can still summon mnml
    // manually after they log in, and the next boot will retry.
    log("[startup] failed to sync login item:", String(err));
  }
}

/* ── App lifecycle ─────────────────────────────────────────────────────────── */
app.whenReady().then(() => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { log("[startup] another instance running; quitting"); app.quit(); return; }

  log("[startup] booting · log:", logPathForDisplay());

  try { getDb(); }
  catch (err) { log("[startup] FATAL: DB init:", String(err)); app.quit(); return; }

  // Make absolutely sure the Run-key registry entry matches the user's
  // saved preference. New installs (default true) get registered here on
  // first boot; existing installs whose registry got cleaned out by an
  // external tool get re-registered. See `syncLoginItemWithSetting` above.
  syncLoginItemWithSetting();

  // Build the in-memory app launcher index once at startup. Tiny and sync —
  // a few hundred Start-Menu shortcuts plus the curated `WINDOWS_SHORTCUTS`
  // list (~80 entries). No filesystem watcher, no worker, no SQLite.
  setImmediate(() => {
    try { rebuildAppIndex(); }
    catch (err) { log("[app-search] index build failed (non-fatal):", String(err)); }
  });

  try { createWindow(); }
  catch (err) { log("[startup] FATAL: createWindow:", String(err)); app.quit(); return; }

  fg = createForegroundService();
  fg.ensureStarted();

  registerIpc({
    hide: hideWindow,
    setBlurLock,
    setPastePending,
    suppressBlurHide: suppressBlurHideFromRenderer,
  });

  try { tray = createTray(); }
  catch (err) { log("[startup] tray failed (non-fatal):", String(err)); }

  if (getSetting("monitoring")) startMonitor();

  onNewItem((item)    => safeSendToRenderer(IPC.onItemAdded,   item));
  onItemUpdated((item) => safeSendToRenderer(IPC.onItemUpdated, item));

  uIOhook.on("mousedown", onGlobalMousedownHandler);
  uIOhook.on("mouseup",   onGlobalMouseupHandler);

  try {
    uIOhook.start();
    log("[uiohook] started for click-outside + auto-paste");
  } catch (err) {
    log("[uiohook] start failed (click-outside + paste disabled):", String(err));
  }

  try {
    uninstallHotkey = installDoubleAlt(() => {
      setTimeout(() => { toggleWindow(); }, 80);
    });
  } catch (err) {
    log("[startup] double-alt failed (non-fatal):", String(err));
  }

  const registered = globalShortcut.register(FALLBACK_SHORTCUT, () => {
    log("[hotkey] fallback fired:", FALLBACK_SHORTCUT);
    toggleWindow();
  });
  log("[hotkey] fallback", FALLBACK_SHORTCUT, registered ? "ok" : "FAILED");

  if (app.isPackaged) {
    try { setupAutoUpdater(); }
    catch (err) { log("[updater] setup failed (non-fatal):", String(err)); }
  }

  app.on("activate", () => {
    if (!isWindowUsable()) {
      recreateWindow(true);
      return;
    }
    showWindow();
  });
}).catch((err) => {
  try { log("[startup] unhandled rejection:", String(err)); } catch { /**/ }
  app.quit();
});

app.on("second-instance", () => {
  log("[lifecycle] second instance → show");
  if (!isWindowUsable()) recreateWindow(true);
  else showWindow();
});
app.on("window-all-closed", () => { /* stay alive for the global hotkey */ });
app.on("before-quit", () => {
  appQuitting = true;
  log("[lifecycle] before-quit");
  if (updaterInterval) { clearInterval(updaterInterval); updaterInterval = null; }
  // Stop the clipboard poller first so it can't write into the
  // about-to-close DB connection. Then checkpoint + close SQLite so
  // the WAL is merged into the main DB file (otherwise a stale
  // `mnml.sqlite-wal` sidecar persists). Both wrapped in try/catch —
  // even a partial shutdown shouldn't block app exit.
  try { stopMonitor(); } catch (err) { log("[lifecycle] stopMonitor:", String(err)); }
  try { closeDb();     } catch (err) { log("[lifecycle] closeDb:",     String(err)); }
  try { fg?.shutdown(); } catch { /* noop */ }
  uIOhook.off("mousedown", onGlobalMousedownHandler);
  uIOhook.off("mouseup",   onGlobalMouseupHandler);
  uninstallHotkey?.();
  globalShortcut.unregisterAll();
  tray?.destroy();
});
