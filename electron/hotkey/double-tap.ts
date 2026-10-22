import { uIOhook, UiohookKey } from "uiohook-napi";
import { log } from "../utils/log.js";

// Detect two Ctrl key-ups within TAP_WINDOW_MS with no other key pressed in between.
// Avoids breaking normal Ctrl use: if ANY non-Ctrl key fires between the two Ctrls, reset.
// Ctrl on both platforms (Control on macOS, not ⌘). Alt was unreliable: Alt taps open
// app menus on Windows, and Option is a typing modifier on macOS.

const TAP_WINDOW_MS = 380;
const SUPPRESS_AFTER_FIRE_MS = 1_000;

type Listener = () => void;

interface UiohookEvent {
  keycode: number;
}

const TAP_CODES = new Set<number>([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
let suppressUntil = 0;

export function suppressDoubleTapFor(ms: number) {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

export function installDoubleTap(listener: Listener): () => void {
  let lastTapUp = 0;
  let pressedDuringTap = false;
  let tapKeyDown = false;

  const resetTapState = () => {
    lastTapUp = 0;
    pressedDuringTap = false;
    tapKeyDown = false;
  };

  const isSuppressed = () => {
    if (Date.now() < suppressUntil) {
      resetTapState();
      return true;
    }
    return false;
  };

  const keydown = (e: UiohookEvent) => {
    if (isSuppressed()) return;
    if (TAP_CODES.has(e.keycode)) {
      // If Ctrl was already down, ignore the auto-repeat keydowns.
      if (!tapKeyDown) tapKeyDown = true;
      return;
    }
    if (tapKeyDown) pressedDuringTap = true;
    lastTapUp = 0;
  };

  const keyup = (e: UiohookEvent) => {
    if (isSuppressed()) return;
    if (!TAP_CODES.has(e.keycode)) return;
    tapKeyDown = false;
    if (pressedDuringTap) {
      pressedDuringTap = false;
      lastTapUp = 0;
      return;
    }
    const now = Date.now();
    if (lastTapUp && now - lastTapUp <= TAP_WINDOW_MS) {
      resetTapState();
      suppressDoubleTapFor(SUPPRESS_AFTER_FIRE_MS);
      log("[hotkey] double-Ctrl fired");
      try {
        listener();
      } catch (err) {
        log("[hotkey] listener error", String(err));
      }
      return;
    }
    lastTapUp = now;
  };

  try {
    uIOhook.on("keydown", keydown);
    uIOhook.on("keyup", keyup);
    log(
      "[hotkey] double-Ctrl detector registered (",
      TAP_WINDOW_MS,
      "ms window)",
    );
  } catch (err) {
    log("[hotkey] FAILED to register double-Ctrl:", String(err));
  }

  return () => {
    try {
      uIOhook.off("keydown", keydown);
      uIOhook.off("keyup", keyup);
    } catch {
      // noop
    }
  };
}
