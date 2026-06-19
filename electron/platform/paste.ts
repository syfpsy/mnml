import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { suppressDoubleAltFor } from "../hotkey/double-alt.js";
import { log } from "../utils/log.js";
import { IS_MAC, IS_WIN } from "./config.js";

let pasteScriptPath: string | null = null;

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

/**
 * Synthesize the platform paste chord into whatever app has keyboard focus.
 * Caller must restore focus to the target app first when auto-pasting.
 */
export function triggerPaste(settleMs = 0, onDone?: () => void) {
  const fire = () => {
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

    if (IS_WIN) {
      const script = ensureWindowsPasteScript();
      exec(`wscript //nologo "${script}"`, (err) => {
        onDone?.();
        if (err) log("[paste] wscript error:", err.message);
        else log("[paste] VBS auto-paste sent");
      });
      return;
    }

    if (IS_MAC) {
      exec(
        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
        (err) => {
          onDone?.();
          if (err) log("[paste] osascript error:", err.message);
          else log("[paste] osascript ⌘V sent");
        },
      );
      return;
    }

    onDone?.();
  };

  if (settleMs > 0) setTimeout(fire, settleMs);
  else fire();
}
