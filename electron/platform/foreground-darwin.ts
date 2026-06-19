import { exec, execSync } from "node:child_process";
import { app } from "electron";
import { log } from "../utils/log.js";

/** Opaque restore target: `pid:<unix id>`. */
export function ownForegroundTarget(): string {
  return `pid:${process.pid}`;
}

export function isOwnForegroundTarget(target: string): boolean {
  return target === ownForegroundTarget();
}

export function captureForegroundTarget(): string | null {
  try {
    const out = execSync(
      "osascript -e 'tell application \"System Events\" to unix id of first process whose frontmost is true'",
      { encoding: "utf8", timeout: 2_000 },
    ).trim();
    const pid = parseInt(out, 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    if (pid === process.pid) return null;
    return `pid:${pid}`;
  } catch (err) {
    log("[focus] darwin capture failed:", String(err));
    return null;
  }
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

export function focusMnmlWindow(): Promise<boolean> {
  const name = app.getName().replace(/"/g, '\\"');
  return new Promise((resolve) => {
    exec(
      `osascript -e 'tell application "System Events" to set frontmost of process "${name}" to true'`,
      { timeout: 2_000 },
      (err) => {
        if (err) {
          log("[focus] darwin focus mnml failed:", err.message);
          resolve(false);
          return;
        }
        resolve(true);
      },
    );
  });
}

function parsePidTarget(target: string): number | null {
  if (!target.startsWith("pid:")) return null;
  const pid = parseInt(target.slice(4), 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}
