import { exec, execFile } from "node:child_process";
import { app } from "electron";
import { log } from "../utils/log.js";

/** Opaque restore target: `pid:<unix id>`. */
export function ownForegroundTarget(): string {
  return `pid:${process.pid}`;
}

export function isOwnForegroundTarget(target: string): boolean {
  return target === ownForegroundTarget();
}

/**
 * Async + `lsappinfo` (~10 ms, no Automation prompt) — the old sync `osascript`
 * call blocked the main thread 100–300 ms on every summon.
 */
export function captureForegroundTarget(): Promise<string | null> {
  const run = (args: string[]) => new Promise<string>((resolve, reject) => {
    execFile("lsappinfo", args, { encoding: "utf8", timeout: 1_000 }, (err, out) => (err ? reject(err) : resolve(out)));
  });
  return run(["front"])
    .then((asn) => run(["info", "-only", "pid", asn.trim()]))
    .then((out) => {
      // Output is `"pid"=123` or `pid = 123` depending on macOS version.
      const pid = parseInt(/"?pid"?\s*=\s*(\d+)/.exec(out)?.[1] ?? "", 10);
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return null;
      return `pid:${pid}`;
    })
    .catch((err) => {
      log("[focus] darwin capture failed:", String(err));
      return null;
    });
}

export function restoreForegroundTarget(target: string): Promise<boolean> {
  const pid = parsePidTarget(target);
  if (!pid) return Promise.resolve(false);

  return new Promise((resolve) => {
    exec(
      `osascript -e 'tell application "System Events" to set frontmost of first process whose unix id is ${pid} to true'`,
      { timeout: 2_000 },
      (err) => {
        if (err) {
          log("[focus] darwin restore failed:", err.message);
          resolve(false);
          return;
        }
        resolve(true);
      },
    );
  });
}

/** Native activate — the old `osascript` System Events call cost an Automation prompt on first summon. */
export function focusMnmlWindow(): Promise<boolean> {
  try {
    app.focus({ steal: true });
    return Promise.resolve(true);
  } catch (err) {
    log("[focus] darwin focus mnml failed:", String(err));
    return Promise.resolve(false);
  }
}

function parsePidTarget(target: string): number | null {
  if (!target.startsWith("pid:")) return null;
  const pid = parseInt(target.slice(4), 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}
