import { app, BrowserWindow, globalShortcut, screen, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { autoUpdater } from "electron-updater";
import { getDb } from "./db/index.js";
import { getSetting } from "./db/settings.js";
import { installDoubleAlt, suppressDoubleAltFor } from "./hotkey/double-alt.js";
import { onNewItem, onItemUpdated, start as startMonitor } from "./clipboard/monitor.js";
import { IPC } from "./ipc-channels.js";
import { registerIpc } from "./ipc.js";
import { rebuildAppIndex } from "./search/app-search.js";
import { log, logPathForDisplay } from "./utils/log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.DIST          = path.join(__dirname, "../dist");
process.env.DIST_ELECTRON = __dirname;
process.env.VITE_PUBLIC   = app.isPackaged
  ? process.env.DIST!
  : path.join(process.env.DIST_ELECTRON, "../public");

const DEV_URL = process.env["VITE_DEV_SERVER_URL"];

const WINDOW_SIZE = { width: 440, height: 540 };
const FALLBACK_SHORTCUT = "Control+Shift+V";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let uninstallHotkey: (() => void) | null = null;
let blurLocked  = false;
let pastePending = false;
let pasteScriptPath: string | null = null;
let rendererReady = false;
let showWhenReady = false;
let loggedSearchFocusForShow = false;
let loggedNativeFocusForShow = false;
let nativeForegroundRequestsForShow = 0;
let toggleLockedUntil = 0;
let focusRunId = 0;
let foregroundHelper: ChildProcessWithoutNullStreams | null = null;
let foregroundHelperBuffer = "";
let updaterInterval: NodeJS.Timeout | null = null;
/**
 * Decimal string of the Win32 HWND that owned foreground focus right before
 * mnml was summoned. Captured each summon via the helper's "prev <hwnd>" line.
 * Used by the auto-paste path to ensure Ctrl+V lands on the originating app
 * rather than on whatever Windows promoted in z-order when we hid.
 */
let prevForegroundHwnd: string | null = null;

/**
 * Tracks whether the window is logically visible.
 * The renderer stays loaded while hidden; showWindow() handles the
 * hidden->shown transition needed for reliable Windows foreground focus.
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

/**
 * Synthesize Ctrl+V into whatever window currently has foreground focus.
 * Tries uiohook-napi's `keyTap` first (in-process `SendInput`, ~instant) and
 * falls back to a one-shot `wscript` + VBS SendKeys if that throws.
 *
 * Caller is responsible for ensuring the *correct* window has focus first —
 * see `requestRestoreForeground()` and the `hideWindow()` paste path.
 */
function triggerPaste() {
  try {
    // Suppress our own double-Alt detector and any other Ctrl/V observers
    // briefly — the synthetic input would otherwise look like a real user
    // keystroke.
    suppressDoubleAltFor(600);
    uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]);
    log("[paste] uIOhook Ctrl+V sent");
    return;
  } catch (err) {
    log("[paste] uIOhook.keyTap failed, falling back to VBS:", String(err));
  }
  // Fallback: write a tiny VBS to userData and run it via wscript.
  const script = ensurePasteScript();
  exec(`wscript //nologo "${script}"`, (err) => {
    if (err) log("[paste] wscript error:", err.message);
    else      log("[paste] VBS auto-paste sent");
  });
}

function setPastePending() { pastePending = true; }

/* Windows foreground activation
 *
 * uIOhook sees double-Alt through a low-level hook, not through an OS-registered
 * accelerator. Windows can therefore show our window but deny it foreground
 * keyboard ownership. Electron/Chromium can still report the search input as
 * focused in that inactive window, which is the bug we kept seeing.
 *
 * The helper keeps one hidden PowerShell process alive and loads a tiny Win32
 * shim once. On each summon we ask it to attach input queues around the current
 * foreground thread and our HWND, then call SetForegroundWindow/SetFocus.
 */
const WINDOWS_FOREGROUND_HELPER = `
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class MnmlForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  const int SW_SHOW = 5;
  const byte VK_MENU = 0x12;
  const uint KEYEVENTF_KEYUP = 0x0002;

  public static IntPtr CapturePrevious() {
    return GetForegroundWindow();
  }

  public static bool Focus(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return false;

    IntPtr foreground = GetForegroundWindow();
    uint foregroundPid;
    uint targetPid;
    uint foregroundThread = GetWindowThreadProcessId(foreground, out foregroundPid);
    uint targetThread = GetWindowThreadProcessId(hWnd, out targetPid);
    uint currentThread = GetCurrentThreadId();

    bool attachedForeground = false;
    bool attachedTarget = false;

    try {
      if (foregroundThread != 0 && foregroundThread != currentThread) {
        attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
      }
      if (targetThread != 0 && targetThread != currentThread) {
        attachedTarget = AttachThreadInput(currentThread, targetThread, true);
      }

      // A synthetic Alt tap clears Windows' foreground lock in the same way a
      // user Alt interaction does. Double-Alt already uses Alt, but injected or
      // hook-observed keyups are not always enough for SetForegroundWindow.
      keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
      keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

      ShowWindowAsync(hWnd, SW_SHOW);
      BringWindowToTop(hWnd);
      SetForegroundWindow(hWnd);
      SwitchToThisWindow(hWnd, true);
      SetFocus(hWnd);
      return GetForegroundWindow() == hWnd;
    } finally {
      if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
      if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
    }
  }

  // Bring an *external* window back to the foreground — used by the auto-paste
  // path so SendKeys lands on the app that had focus before mnml was summoned,
  // not on whatever Windows happened to promote in z-order when we hid.
  public static bool Restore(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return false;

    // Same Alt-tap trick used in Focus(): unblocks the calling process's
    // ability to call SetForegroundWindow on an unrelated window.
    keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

    ShowWindowAsync(hWnd, SW_SHOW);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    SwitchToThisWindow(hWnd, true);
    return GetForegroundWindow() == hWnd;
  }
}
"@

# Protocol:
#   <hwnd>                  → capture current foreground (print "prev <hwnd>"),
#                             then bring <hwnd> to front (print "ok" / "miss")
#   restore <hwnd>          → SetForegroundWindow on <hwnd> (print "ok" / "miss")
#   exit                    → quit
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $line = $line.Trim()
  if ($line -eq "exit") { break }
  try {
    if ($line.StartsWith("restore ")) {
      $hwnd = [IntPtr]([Int64]($line.Substring(8)))
      $ok = [MnmlForeground]::Restore($hwnd)
      [Console]::Out.WriteLine($(if ($ok) { "ok" } else { "miss" }))
    } else {
      $hwnd = [IntPtr]([Int64]$line)
      $prev = [MnmlForeground]::CapturePrevious()
      [Console]::Out.WriteLine("prev " + $prev.ToInt64())
      $ok = [MnmlForeground]::Focus($hwnd)
      [Console]::Out.WriteLine($(if ($ok) { "ok" } else { "miss" }))
    }
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine("error: " + $_.Exception.Message)
    [Console]::Out.Flush()
  }
}
`;

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

function windowHandleAsDecimal(w: BrowserWindow): string | null {
  const handle = w.getNativeWindowHandle();
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString();
  if (handle.length >= 4) return BigInt(handle.readUInt32LE(0)).toString();
  return null;
}

function handleForegroundHelperLine(line: string) {
  if (!line) return;
  if (line.startsWith("prev ")) {
    // Helper reports the foreground HWND it observed *before* it acted.
    // Save it so the paste path can restore it as the target for Ctrl+V.
    const hwnd = line.slice(5).trim();
    prevForegroundHwnd = hwnd && hwnd !== "0" ? hwnd : null;
    return;
  }
  if (line === "ok") {
    if (!loggedNativeFocusForShow) {
      loggedNativeFocusForShow = true;
      log("[focus] windows foreground focused");
    }
    scheduleSearchFocusVerification("native-foreground", [0, 16, 50, 120, 240]);
    return;
  }
  if (line === "miss") {
    return;
  }
  log("[focus] foreground helper:", line);
}

function ensureForegroundHelper(): ChildProcessWithoutNullStreams | null {
  if (process.platform !== "win32") return null;
  if (foregroundHelper && !foregroundHelper.killed) return foregroundHelper;

  const encoded = Buffer.from(WINDOWS_FOREGROUND_HELPER, "utf16le").toString("base64");
  const child = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );

  child.stdout.setEncoding("utf8");
  // Cap the accumulator. The helper emits one "ok" / "miss" / "error: …"
  // per request, all newline-terminated, so the residual after split should
  // always be tiny. If it ever isn't (e.g. PowerShell hangs mid-line and
  // dumps a long backtrace), we don't want this string to grow forever and
  // pin live memory inside the closure.
  const HELPER_BUFFER_CAP = 16 * 1024;
  child.stdout.on("data", (chunk: string) => {
    foregroundHelperBuffer += chunk;
    if (foregroundHelperBuffer.length > HELPER_BUFFER_CAP) {
      log("[focus] foreground helper buffer overflow; truncating");
      // Keep only the tail — most likely the start of a line we haven't
      // seen the newline for yet.
      foregroundHelperBuffer = foregroundHelperBuffer.slice(-1024);
    }
    const lines = foregroundHelperBuffer.split(/\r?\n/);
    foregroundHelperBuffer = lines.pop() ?? "";
    for (const line of lines) handleForegroundHelperLine(line.trim());
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const msg = chunk.trim();
    if (msg && !msg.startsWith("#< CLIXML")) log("[focus] foreground helper stderr:", msg);
  });
  child.on("exit", (code) => {
    foregroundHelper = null;
    foregroundHelperBuffer = "";
    if (code !== 0 && code !== null) log("[focus] foreground helper exited:", code);
  });
  child.on("error", (err) => {
    foregroundHelper = null;
    log("[focus] foreground helper failed:", String(err));
  });

  foregroundHelper = child;
  return child;
}

function requestNativeForeground() {
  if (!win || win.isDestroyed()) return;
  if (nativeForegroundRequestsForShow >= 1) return;
  const helper = ensureForegroundHelper();
  if (!helper || helper.stdin.destroyed) return;

  const hwnd = windowHandleAsDecimal(win);
  if (!hwnd) return;

  try {
    nativeForegroundRequestsForShow += 1;
    suppressDoubleAltFor(1_200);
    helper.stdin.write(`${hwnd}\n`);
  } catch (err) {
    log("[focus] foreground request failed:", String(err));
  }
}

/**
 * Ask the helper to bring an external HWND back to the foreground. Used by
 * the auto-paste path to restore focus to the app the user was working in
 * before they summoned mnml.
 */
function requestRestoreForeground(hwnd: string) {
  const helper = ensureForegroundHelper();
  if (!helper || helper.stdin.destroyed) return;
  try {
    // Brief detector suppression — the helper sends a synthetic Alt tap to
    // unblock SetForegroundWindow; we don't want it tripping double-Alt.
    suppressDoubleAltFor(600);
    helper.stdin.write(`restore ${hwnd}\n`);
  } catch (err) {
    log("[focus] restore request failed:", String(err));
  }
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

  win = new BrowserWindow({
    ...size,
    x, y,
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
  win.on("focus", () => {
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
    if (!win || win.isDestroyed()) return;
    rendererReady = true;
    win.setIgnoreMouseEvents(true, { forward: true });
    log("[startup] renderer ready");
    if (showWhenReady) {
      showWhenReady = false;
      showWindow();
    }
  });
}

function showWindow() {
  if (!win) { log("[show] no window"); return; }
  if (!rendererReady) {
    showWhenReady = true;
    return;
  }
  if (windowVisible && win.isVisible()) {
    focusRunId += 1;
    loggedSearchFocusForShow = false;
    loggedNativeFocusForShow = false;
    nativeForegroundRequestsForShow = 0;
    runSummonFocusPass(true);
    scheduleSearchFocusVerification("visible-window", [16, 50, 120, 240, 420]);
    win.webContents.send(IPC.onVisibilityChanged, true);
    return;
  }

  const size     = WINDOW_SIZE;
  const { x, y } = positionNearCursor(size.width, size.height);

  win.setBounds({ ...size, x, y }, false);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setFocusable(true);

  windowShownAt = Date.now();
  windowVisible = true;
  focusRunId += 1;
  loggedSearchFocusForShow = false;
  loggedNativeFocusForShow = false;
  nativeForegroundRequestsForShow = 0;
  win.setIgnoreMouseEvents(false);

  // win.show() gives Electron its normal activation path. The follow-up focus
  // passes also request native foreground activation because uIOhook callbacks
  // are not treated like OS-registered global shortcuts by Windows.
  win.show();
  runSummonFocusPass(true);
  scheduleSearchFocusVerification("show", [16, 50, 100, 180, 300, 500, 800, 1_200]);

  setImmediate(() => {
    if (!win || win.isDestroyed() || !windowVisible) return;
    win.webContents.send(IPC.onVisibilityChanged, true);
  });

  log("[show] window shown at", { x, y, ...size });
}

function hideWindow() {
  if (!win) return;
  blurLocked    = false;
  windowVisible = false;
  focusRunId += 1;

  win.setIgnoreMouseEvents(true, { forward: true });

  // Notify renderer
  win.webContents.send(IPC.onVisibilityChanged, false);

  if (pastePending) {
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
    win.hide();
    const target = prevForegroundHwnd;
    if (target) {
      requestRestoreForeground(target);
      // 150 ms covers helper IPC + Windows' SetForegroundWindow processing
      // on a typical machine. If it slips, the paste still lands somewhere
      // reasonable (the user's last foreground app or its replacement).
      setTimeout(triggerPaste, 150);
    } else {
      // No captured HWND — fall back to the old behaviour with a slightly
      // longer wait for Windows to settle z-order on its own.
      win.blur();
      setTimeout(triggerPaste, 300);
    }
  } else {
    // Normal hide (Escape / click-outside).
    // Truly hide so the next showWindow() operates on a hidden HWND and gets
    // OS focus unconditionally via ShowWindow(SW_SHOW).
    win.hide();
  }
}

function toggleWindow() {
  if (!win) return;
  const now = Date.now();
  if (now < toggleLockedUntil) {
    log("[toggle] ignored repeat");
    return;
  }
  toggleLockedUntil = now + 650;
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

  ensureForegroundHelper();

  registerIpc({ hide: hideWindow, setBlurLock, setPastePending });

  try { tray = createTray(); }
  catch (err) { log("[startup] tray failed (non-fatal):", String(err)); }

  if (getSetting("monitoring")) startMonitor();

  onNewItem((item)    => win?.webContents.send(IPC.onItemAdded,   item));
  onItemUpdated((item) => win?.webContents.send(IPC.onItemUpdated, item));

  uIOhook.on("mousedown", onGlobalMousedown);

  try {
    uninstallHotkey = installDoubleAlt(() => {
      setTimeout(() => { if (win) toggleWindow(); }, 80);
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
  if (updaterInterval) { clearInterval(updaterInterval); updaterInterval = null; }
  try { foregroundHelper?.stdin.write("exit\n"); } catch { /* noop */ }
  try { foregroundHelper?.kill(); } catch { /* noop */ }
  uIOhook.off("mousedown", onGlobalMousedown);
  uninstallHotkey?.();
  globalShortcut.unregisterAll();
  tray?.destroy();
});
