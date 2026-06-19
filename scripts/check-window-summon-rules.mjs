import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const main = readFileSync(join(root, "electron", "main.ts"), "utf8");
const fgWin = readFileSync(join(root, "electron", "platform", "foreground-win.ts"), "utf8");
const fg = readFileSync(join(root, "electron", "platform", "foreground.ts"), "utf8");
const ipc = readFileSync(join(root, "electron", "ipc.ts"), "utf8");
const app = readFileSync(join(root, "src", "app.tsx"), "utf8");
const searchBar = readFileSync(join(root, "src", "components", "search-bar.tsx"), "utf8");
const styles = readFileSync(join(root, "src", "styles.css"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

const failures = [];

if (/transparent\s*:\s*true/.test(main)) {
  failures.push("BrowserWindow must not use transparent: true; it flashes on Windows summon.");
}

if (/\.setOpacity\s*\(/.test(main)) {
  failures.push("Summon path must not use setOpacity(); it exposes stale frames on Windows.");
}

if (!main.includes("FOCUS_SEARCH_SCRIPT") || !main.includes("executeJavaScript(FOCUS_SEARCH_SCRIPT")) {
  failures.push("Main process must own search focus with FOCUS_SEARCH_SCRIPT after native show().");
}

if (!main.includes("runSummonFocusPass(true)") ||
    !main.includes("scheduleSearchFocusVerification(\"show\"")) {
  failures.push("showWindow() must run native focus once and schedule verified search focus after win.show().");
}

if (!/installDoubleAlt\(\(\)\s*=>\s*{\s*setTimeout/.test(main)) {
  failures.push("Double-Alt must delay toggleWindow() so the Alt key-up finishes before focus.");
}

if (!fgWin.includes("WINDOWS_FOREGROUND_HELPER") ||
    !fgWin.includes("AttachThreadInput") ||
    !main.includes("requestNativeForeground();") ||
    !main.includes("suppressDoubleAltFor(")) {
  failures.push("Summon must include native foreground activation (Windows helper + macOS osascript).");
}

if (!fgWin.includes('if ($line -eq "capture")') ||
    !fgWin.includes('StartsWith("focus ")') ||
    !main.includes("requestCapturePrev(") ||
    !main.includes("cancelCapturePrev(") ||
    !fg.includes("onRestoreOk") ||
    !main.includes("ForegroundService")) {
  failures.push("Auto-paste must capture prev foreground before win.show() via ForegroundService.");
}

if (!main.includes("nativeForegroundRequestsForShow >= 1") ||
    !main.includes("runSummonFocusPass(true)") ||
    !main.includes("toggleLockedUntil")) {
  failures.push("Native foreground activation must be one-shot per summon with a repeat-toggle guard.");
}

if (!/setTimeout\(\(\)\s*=>\s*{\s*(?:if \(win\) )?toggleWindow\(\);\s*},\s*(?:[8-9]\d|[1-9]\d{2,})\)/.test(main)) {
  failures.push("Double-Alt must wait at least 80ms after Alt key-up before toggling focus.");
}

if (!main.includes("suppressDoubleAltFor(1_200)") && !main.includes("IS_WIN ? 1_200")) {
  failures.push("Native foreground activation must suppress uIOhook long enough to ignore synthetic Alt unlocks.");
}

if (!main.includes("document.hasFocus() && document.activeElement === input") ||
    !main.includes("scheduleSearchFocusVerification(\"native-foreground\"") ||
    !main.includes("win.on(\"focus\"")) {
  failures.push("Search focus must be verified with document.hasFocus() and retried after native/window focus.");
}

if (!readFileSync(join(root, "electron", "hotkey", "double-alt.ts"), "utf8").includes("SUPPRESS_AFTER_FIRE_MS")) {
  failures.push("Double-Alt detector must suppress repeats immediately after a real fire.");
}

if (!main.includes("render-process-gone") || !main.includes("recreateWindow(")) {
  failures.push("Main process must recover from renderer crashes via render-process-gone → recreateWindow().");
}

if (!main.includes("reconcileVisibilityFlag") || !main.includes("uncaughtException")) {
  failures.push("Main process must reconcile windowVisible with the OS HWND and log uncaught exceptions without quitting.");
}

if (!main.includes("safeSendToRenderer")) {
  failures.push("Main process must guard renderer IPC with safeSendToRenderer() so dead webContents don't throw.");
}

if (!main.includes("before-input-event") || !main.includes("markInternalPointerDown")) {
  failures.push("Blur hide must suppress on in-window pointer down (before-input-event + markInternalPointerDown).");
}

if (!main.includes("scheduleBlurHide") || !main.includes("isPointInsideWindow")) {
  failures.push("Click-outside must use uIOhook screen coords + isPointInsideWindow() and a deferred blur hide with focus re-check.");
}

if (!main.includes("pasteFlowActive") || !main.includes("startFocusWatchdog")) {
  failures.push("Auto-paste must lock pasteFlowActive during restore→paste and run a focus watchdog while the window is visible.");
}

if (!main.includes("armPasteFlowSafety")) {
  failures.push("Paste flow must have a safety timeout so dismiss is not blocked forever.");
}

if (!main.includes('if (!windowVisible && (pasteFlowActive')) {
  failures.push("toggleWindow must ignore show while paste flow is in flight.");
}

if (!ipc.includes("clampListLimit")) {
  failures.push("IPC list/search handlers must clamp limits via clampListLimit().");
}

if (!main.includes('onGlobalMouseOutside(e, "mouseup")') || !main.includes("onGlobalMousedownHandler")) {
  failures.push("Click-outside must listen to both uIOhook mousedown and mouseup with stable handler refs for cleanup.");
}

if (!main.includes("uIOhook.start()")) {
  failures.push("uIOhook must start independently of double-Alt so click-outside and paste work when hotkey install fails.");
}

if (!readFileSync(join(root, "electron", "clipboard", "monitor.ts"), "utf8").includes("clipboard.clear()")) {
  failures.push("Clipboard restore must clear existing formats before write (text-over-image auto-paste bug).");
}

if (!searchBar.includes("autoFocus = false")) {
  failures.push("SearchBar must not autoFocus while the hidden renderer is booting; main owns summon focus.");
}

if (!app.includes("Renderer-side backup focus")) {
  failures.push("Renderer backup focus rule/comment is missing from src/app.tsx.");
}

if (app.includes("w-full h-full p-1") || app.includes("rounded-[10px] overflow-hidden")) {
  failures.push("Opaque BrowserWindow must not use a transparent rounded outer gap; it creates the black-card border.");
}

if (!/body\s*{[^}]*background:\s*var\(--bg\)/s.test(styles) || /<body[^>]*bg-transparent/.test(html)) {
  failures.push("Renderer body must paint var(--bg), not transparent, because the window is intentionally opaque.");
}

if (failures.length > 0) {
  console.error("Window summon rule check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Window summon rules ok");
