import { uIOhook, UiohookKey } from "uiohook-napi";
import { log } from "../utils/log.js";

// Detect two Alt key-ups within TAP_WINDOW_MS with no other key pressed in between.
// Avoids breaking normal Alt use: if ANY non-Alt key fires between the two Alts, reset.

const TAP_WINDOW_MS = 380;
const SUPPRESS_AFTER_FIRE_MS = 1_000;

type Listener = () => void;

interface UiohookEvent {
  keycode: number;
}

const ALT_CODES = new Set<number>([UiohookKey.Alt, UiohookKey.AltRight]);
let suppressUntil = 0;

export function suppressDoubleAltFor(ms: number) {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

export function installDoubleAlt(listener: Listener): () => void {
  let lastAltUp = 0;
  let pressedDuringAlt = false;
  let altIsDown = false;

  const resetTapState = () => {
    lastAltUp = 0;
    pressedDuringAlt = false;
    altIsDown = false;
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
    if (ALT_CODES.has(e.keycode)) {
      // If Alt was already down, ignore the auto-repeat keydowns.
      if (!altIsDown) altIsDown = true;
      return;
    }
    if (altIsDown) pressedDuringAlt = true;
    lastAltUp = 0;
  };

  const keyup = (e: UiohookEvent) => {
    if (isSuppressed()) return;
    if (!ALT_CODES.has(e.keycode)) return;
    altIsDown = false;
    if (pressedDuringAlt) {
      pressedDuringAlt = false;
      lastAltUp = 0;
      return;
    }
    const now = Date.now();
    if (lastAltUp && now - lastAltUp <= TAP_WINDOW_MS) {
      resetTapState();
      suppressDoubleAltFor(SUPPRESS_AFTER_FIRE_MS);
      log("[hotkey] double-alt fired");
      try {
        listener();
      } catch (err) {
        log("[hotkey] listener error", String(err));
      }
      return;
    }
    lastAltUp = now;
  };

  try {
    uIOhook.on("keydown", keydown);
    uIOhook.on("keyup", keyup);
    log(
      "[hotkey] double-Alt detector registered (",
      TAP_WINDOW_MS,
      "ms window)",
    );
  } catch (err) {
    log("[hotkey] FAILED to register double-Alt:", String(err));
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
