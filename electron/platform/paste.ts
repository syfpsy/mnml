import { exec, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { suppressDoubleAltFor } from "../hotkey/double-alt.js";
import { log } from "../utils/log.js";
import { IS_MAC, IS_WIN } from "./config.js";

let pasteScriptPath: string | null = null;
let pasteSettleTimer: ReturnType<typeof setTimeout> | null = null;
let pasteChild: ChildProcess | null = null;
/** Bumped on cancel so late exec callbacks / keyTap after cancel are no-ops. */
let pasteGen = 0;

function ensureWindowsPasteScript(): string {
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

/** Cancel settle timer + kill fallback child so Quit cannot inject Ctrl+V later. */
export function cancelPendingPaste() {
  pasteGen += 1;
  if (pasteSettleTimer !== null) {
    clearTimeout(pasteSettleTimer);
    pasteSettleTimer = null;
  }
  if (pasteChild) {
    try { pasteChild.kill(); } catch { /* noop */ }
    pasteChild = null;
  }
}

/**
 * Synthesize the platform paste chord into whatever app has keyboard focus.
 * Caller must restore focus to the target app first when auto-pasting.
 */
export function triggerPaste(settleMs = 0, onDone?: () => void) {
  cancelPendingPaste();
  const gen = pasteGen;

  const fire = () => {
    pasteSettleTimer = null;
    if (gen !== pasteGen) {
      onDone?.();
      return;
    }
    try {
      suppressDoubleAltFor(600);
      if (IS_MAC) {
        uIOhook.keyTap(UiohookKey.V, [UiohookKey.Meta]);
        log("[paste] uIOhook ⌘V sent");
      } else {
        uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]);
        log("[paste] uIOhook Ctrl+V sent");
      }
      onDone?.();
      return;
    } catch (err) {
      log("[paste] uIOhook.keyTap failed:", String(err));
    }

    if (gen !== pasteGen) {
      onDone?.();
      return;
    }

    if (IS_WIN) {
      const script = ensureWindowsPasteScript();
      pasteChild = exec(`wscript //nologo "${script}"`, (err) => {
        pasteChild = null;
        if (gen !== pasteGen) {
          onDone?.();
          return;
        }
        onDone?.();
        if (err) log("[paste] wscript error:", err.message);
        else log("[paste] VBS auto-paste sent");
      });
      return;
    }

    if (IS_MAC) {
      pasteChild = exec(
        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
        (err) => {
          pasteChild = null;
          if (gen !== pasteGen) {
            onDone?.();
            return;
          }
          onDone?.();
          if (err) log("[paste] osascript error:", err.message);
          else log("[paste] osascript ⌘V sent");
        },
      );
      return;
    }

    onDone?.();
  };

  if (settleMs > 0) {
    pasteSettleTimer = setTimeout(fire, settleMs);
  } else {
    fire();
  }
}
