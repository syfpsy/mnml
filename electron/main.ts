import { app, BrowserWindow, globalShortcut, screen, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import fs from "node:fs";
import { uIOhook } from "uiohook-napi";
import { autoUpdater } from "electron-updater";
import { getDb } from "./db/index.js";
import { getSetting, setSetting } from "./db/settings.js";
import { installDoubleAlt } from "./hotkey/double-alt.js";
import { onNewItem, onItemUpdated, start as startMonitor } from "./clipboard/monitor.js";
import { IPC, type WindowMode } from "./ipc-channels.js";
import { registerIpc } from "./ipc.js";
import { log, logPathForDisplay } from "./utils/log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.DIST          = path.join(__dirname, "../dist");
process.env.DIST_ELECTRON = __dirname;
process.env.VITE_PUBLIC   = app.isPackaged
  ? process.env.DIST!
  : path.join(process.env.DIST_ELECTRON, "../public");

const DEV_URL = process.env["VITE_DEV_SERVER_URL"];

const COMPACT_SIZE  = { width: 440, height: 540 };
const EXPANDED_SIZE = { width: 880, height: 680 };
const FALLBACK_SHORTCUT = "Control+Shift+V";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let uninstallHotkey: (() => void) | null = null;
let currentMode: WindowMode = "compact"; // overwritten from DB in whenReady
let blurLocked  = false;
let pastePending = false;
let pasteScriptPath: string | null = null;

/**
 * Tracks whether the window is logically visible (opacity = 1).
 * We keep the OS window alive at opacity 0 instead of calling win.hide(),
 * so the renderer never suspends and setOpacity(1) is always paint-flush-free.
 */
let windowVisible = false;

/** Timestamp set by showWindow(); used to debounce spurious blur/mousedown. */
let windowShownAt = 0;

/* ── Click-outside via global mouse hook ──────────────────────────────────── */
function onGlobalMousedown(e: { x: number; y: number }) {
  if (!win || !windowVisible || blurLocked) return;
  if (Date.now() - windowShownAt < 350) return; // ignore the opening click
  const b = win.getBounds();
  const inside =
    e.x >= b.x && e.x <= b.x + b.width &&
    e.y >= b.y && e.y <= b.y + b.height;
  if (!inside) {
    log("[mouse] outside click — hiding");
    hideWindow();
  }
}

/* ── Paste helper ──────────────────────────────────────────────────────────── */
function ensurePasteScript(): string {
  if (!pasteScriptPath) {
    const dir = app.getPath("userData");
    pasteScriptPath = path.join(dir, "paste.vbs");
    const vbs =
      'Set ws = CreateObject("WScript.Shell")\r\n' +
      'ws.SendKeys "^v"\r\n';
    try { fs.writeFileSync(pasteScriptPath, vbs, "ascii"); }
    catch (err) { log("[paste] failed to write paste.vbs:", String(err)); }
  }
  return pasteScriptPath;
}

function triggerPaste() {
  const script = ensurePasteScript();
  exec(`wscript //nologo "${script}"`, (err) => {
    if (err) log("[paste] wscript error:", err.message);
    else      log("[paste] auto-paste sent");
  });
}

function setPastePending() { pastePending = true; }

/* ── Tray icon ─────────────────────────────────────────────────────────────── */
function createTrayIcon(): Electron.NativeImage {
  const size = 16;
  const buf  = Buffer.alloc(size * size * 4, 0);
  const px   = (x: number, y: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = buf[i + 1] = buf[i + 2] = 255;
    buf[i + 3] = 255;
  };
  for (let y = 2; y <= 13; y++) { px(3, y); px(4, y); px(11, y); px(12, y); }
  px(5,3); px(5,4); px(6,4); px(6,5); px(7,5); px(7,6);
  px(10,3); px(10,4); px(9,4); px(9,5); px(8,5); px(8,6);
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 1.0 });
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
  t.setToolTip("mnml — clipboard manager\nDouble-tap Alt to show/hide");
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
    win?.webContents.send(IPC.onUpdateAvailable, info.version);
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
    win?.webContents.send(IPC.onUpdateDownloaded, info.version);
    tray?.setToolTip(`mnml — update v${info.version} ready`);
    tray?.setContextMenu(buildTrayMenu(info.version));
  });

  autoUpdater.on("error", (err) => {
    log("[updater] error:", err.message);
  });

  // Check on startup, then every 4 hours for long-running instances.
  const check = () =>
    autoUpdater.checkForUpdates().catch((err) =>
      log("[updater] check failed:", err.message),
    );
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
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

/* ── Window lifecycle ──────────────────────────────────────────────────────── */
function createWindow() {
  const size     = currentMode === "expanded" ? EXPANDED_SIZE : COMPACT_SIZE;
  const { x, y } = positionNearCursor(size.width, size.height);

  win = new BrowserWindow({
    ...size,
    x, y,
    show:        false,
    opacity:     0,       // start fully transparent; showWindow() sets it to 1
    frame:       false,
    transparent: true,
    resizable:   false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow:   true,
    backgroundColor: "#00000000",
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

  // Diagnostics
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    log("[renderer] did-fail-load", code, desc, url);
  });
  win.webContents.on("console-message", (_e, level, msg, line, src) => {
    if (level >= 2) log("[renderer] console", level, msg, `${src}:${line}`);
  });

  // Blur: hide when the user Alt-Tabs or clicks away, but only after the
  // window has had time to acquire focus (guards against Windows' focus-deny
  // race that used to cause an immediate hide right after show).
  win.on("blur", () => {
    if (blurLocked || !windowVisible) return;
    if (Date.now() - windowShownAt < 500) return;
    if (!win?.webContents.isDevToolsOpened()) hideWindow();
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(process.env.DIST!, "index.html"));
  }

  // Show the OS window once (invisibly) so the renderer is always live.
  // All subsequent show/hide operations use setOpacity() — no paint flush.
  win.webContents.once("did-finish-load", () => {
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(true, { forward: true });
    win.showInactive(); // show at opacity 0, no focus steal
    log("[startup] window pre-shown (opacity 0)");
  });
}

function showWindow() {
  if (!win) { log("[show] no window"); return; }

  const size     = currentMode === "compact" ? COMPACT_SIZE : EXPANDED_SIZE;
  const { x, y } = positionNearCursor(size.width, size.height);

  // Reposition/resize while still invisible.
  win.setBounds({ ...size, x, y });
  win.setAlwaysOnTop(true, "screen-saver");

  // Reveal: no OS show/hide, just flip opacity and re-enable mouse events.
  windowShownAt = Date.now();
  windowVisible = true;
  win.setIgnoreMouseEvents(false);
  win.setOpacity(1);

  // Notify renderer (focuses search input, etc.)
  win.webContents.send(IPC.onVisibilityChanged, true);

  // On Windows, win.focus() alone respects the OS "focus steal prevention"
  // policy and silently fails when another app is in the foreground.
  // app.focus({ steal: true }) bypasses that policy for clipboard-manager
  // use-cases where the user explicitly triggered the hotkey.
  app.focus({ steal: true });
  win.focus();
  // Belt-and-suspenders: a second focus attempt after 50 ms covers the narrow
  // window where the OS finishes activating the process between the two calls.
  setTimeout(() => {
    if (!win || win.isDestroyed() || !windowVisible) return;
    win.focus();
    win.webContents.focus();
  }, 50);

  log("[show] window shown at", { x, y, ...size });
}

function hideWindow() {
  if (!win) return;
  blurLocked    = false;
  windowVisible = false;

  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });

  // Notify renderer
  win.webContents.send(IPC.onVisibilityChanged, false);

  // Fire auto-paste if a restore was queued.
  // setOpacity(0) alone does NOT transfer OS focus to the target app.
  // Sequence: blur (tells OS to activate the previous window) → hide → paste.
  if (pastePending) {
    pastePending = false;
    win.blur();   // signal OS: give focus back to whoever had it before us
    win.hide();   // truly remove from the window stack
    setTimeout(triggerPaste, 300);  // 300 ms is enough for focus to settle
    setTimeout(() => {
      if (!win || win.isDestroyed() || windowVisible) return;
      win.setOpacity(0);
      win.setIgnoreMouseEvents(true, { forward: true });
      win.showInactive();
    }, 700);
  }
}

function toggleWindow() {
  if (!win) return;
  if (windowVisible) { log("[toggle] hiding");  hideWindow();  return; }
  log("[toggle] showing");
  showWindow();
}

function setBlurLock(locked: boolean) { blurLocked = locked; }

function setMode(mode: WindowMode) {
  if (!win) return;
  currentMode = mode;
  const size = mode === "compact" ? COMPACT_SIZE : EXPANDED_SIZE;
  const b    = win.getBounds();
  // Skip if the size is already correct (e.g. initial sync from renderer).
  if (b.width === size.width && b.height === size.height) return;
  // Keep current position; clamp so the resized window stays on screen.
  const display    = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const { workArea } = display;
  const GAP = 18;
  const x = Math.max(workArea.x + GAP, Math.min(b.x, workArea.x + workArea.width  - size.width  - GAP));
  const y = Math.max(workArea.y + GAP, Math.min(b.y, workArea.y + workArea.height - size.height - GAP));
  win.setBounds({ ...size, x, y }, windowVisible);
}

/* ── App lifecycle ─────────────────────────────────────────────────────────── */
app.whenReady().then(() => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { log("[startup] another instance running; quitting"); app.quit(); return; }

  log("[startup] booting · log:", logPathForDisplay());

  try { getDb(); }
  catch (err) { log("[startup] FATAL: DB init:", String(err)); app.quit(); return; }

  // Use persisted mode so createWindow() opens at the right size immediately.
  currentMode = (getSetting("windowMode") as WindowMode) ?? "compact";

  try { createWindow(); }
  catch (err) { log("[startup] FATAL: createWindow:", String(err)); app.quit(); return; }

  registerIpc({ hide: hideWindow, setMode, setBlurLock, setPastePending });

  try { tray = createTray(); }
  catch (err) { log("[startup] tray failed (non-fatal):", String(err)); }

  if (getSetting("monitoring")) startMonitor();

  onNewItem((item)    => win?.webContents.send(IPC.onItemAdded,   item));
  onItemUpdated((item) => win?.webContents.send(IPC.onItemUpdated, item));

  uIOhook.on("mousedown", onGlobalMousedown);

  try {
    uninstallHotkey = installDoubleAlt(() => { if (win) toggleWindow(); });
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
}).catch((err) => {
  try { log("[startup] unhandled rejection:", String(err)); } catch { /**/ }
  app.quit();
});

app.on("second-instance", () => { log("[lifecycle] second instance → show"); showWindow(); });
app.on("window-all-closed", () => { /* stay alive for the global hotkey */ });
app.on("before-quit", () => {
  log("[lifecycle] before-quit");
  uIOhook.off("mousedown", onGlobalMousedown);
  uninstallHotkey?.();
  globalShortcut.unregisterAll();
  tray?.destroy();
});
