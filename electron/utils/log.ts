import fs from "node:fs";
import { app } from "electron";
import { resolvePathWithinBase } from "./safe-path.js";

let logPath: string | null = null;

function ensurePath(): string {
  if (logPath) return logPath;
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  logPath = resolvePathWithinBase(dir, "mnml.log");
  return logPath;
}

function ts() {
  const d = new Date();
  return d.toISOString().replaceAll("T", " ").slice(0, 19);
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
