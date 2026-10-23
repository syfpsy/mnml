import { uIOhook, UiohookKey } from "uiohook-napi";
import { log } from "../utils/log.js";
import { IS_MAC } from "../platform/config.js";

// Detect two key-ups of the summon key within TAP_WINDOW_MS with no other key pressed
// in between, so combos (Ctrl+C, ⌘V, ⌘Tab…) never trip it: any other key resets.
// Summon key: Ctrl on Windows, Command (left or right ⌘) on macOS. Alt was unreliable
// (Alt taps open app menus on Windows, Option is a typing modifier on macOS), and a
// double Control on a real Mac keyboard didn't register for the user.

// 450 ms between the two key-ups: 380 ms missed relaxed double-taps.
const TAP_WINDOW_MS = 450;
const SUPPRESS_AFTER_FIRE_MS = 1_000;

type Listener = () => void;

interface UiohookEvent {
  keycode: number;
}

const TAP_CODES = new Set<number>(IS_MAC ? [UiohookKey.Meta, UiohookKey.MetaRight] : [UiohookKey.Ctrl, UiohookKey.CtrlRight]);
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
      // If the summon key was already down, ignore the auto-repeat keydowns.
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
      log("[hotkey] double-tap fired");
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
      IS_MAC ? "[hotkey] double-⌘ detector registered (" : "[hotkey] double-Ctrl detector registered (",
      TAP_WINDOW_MS,
      "ms window)",
    );
  } catch (err) {
    log("[hotkey] FAILED to register double-tap:", String(err));
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
