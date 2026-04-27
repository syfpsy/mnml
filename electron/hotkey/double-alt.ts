import { uIOhook, UiohookKey } from "uiohook-napi";
import { log } from "../utils/log.js";

// Detect two Alt key-ups within TAP_WINDOW_MS with no other key pressed in between.
// Avoids breaking normal Alt use: if ANY non-Alt key fires between the two Alts, reset.

const TAP_WINDOW_MS = 380;

type Listener = () => void;

interface UiohookEvent {
  keycode: number;
}

const ALT_CODES = new Set<number>([UiohookKey.Alt, UiohookKey.AltRight]);

export function installDoubleAlt(listener: Listener): () => void {
  let lastAltUp = 0;
  let pressedDuringAlt = false;
  let altIsDown = false;
  let started = false;

  const keydown = (e: UiohookEvent) => {
    if (ALT_CODES.has(e.keycode)) {
      // If Alt was already down, ignore the auto-repeat keydowns.
      if (!altIsDown) altIsDown = true;
      pressedDuringAlt = false;
      return;
    }
    if (altIsDown) pressedDuringAlt = true;
    lastAltUp = 0;
  };

  const keyup = (e: UiohookEvent) => {
    if (!ALT_CODES.has(e.keycode)) return;
    altIsDown = false;
    if (pressedDuringAlt) {
      pressedDuringAlt = false;
      lastAltUp = 0;
      return;
    }
    const now = Date.now();
    if (lastAltUp && now - lastAltUp <= TAP_WINDOW_MS) {
      lastAltUp = 0;
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
    uIOhook.start();
    started = true;
    log(
      "[hotkey] uiohook started, listening for double-Alt within",
      TAP_WINDOW_MS,
      "ms",
    );
  } catch (err) {
    log("[hotkey] FAILED to start uiohook:", String(err));
  }

  return () => {
    try {
      uIOhook.off("keydown", keydown);
      uIOhook.off("keyup", keyup);
      if (started) uIOhook.stop();
    } catch {
      // noop
    }
  };
}
