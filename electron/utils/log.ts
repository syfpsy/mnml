import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

let logPath: string | null = null;

function ensurePath(): string {
  if (logPath) return logPath;
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  logPath = path.join(dir, "mnml.log");
  return logPath;
}

function ts() {
  const d = new Date();
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function log(...args: unknown[]) {
  const line = `[${ts()}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  // tee to console for dev visibility
  // eslint-disable-next-line no-console
  console.log("[mnml]", ...args);
  try {
    fs.appendFileSync(ensurePath(), line);
  } catch {
    // ignore file write errors
  }
}

export function logPathForDisplay(): string {
  return ensurePath();
}
