/**
 * data-dir.ts — resolves where mnml's persistent data lives.
 *
 * The default is `app.getPath("userData")` (Windows: `%APPDATA%/mnml`). The
 * user can re-point this to ANY local folder — typically a Dropbox / OneDrive
 * / iCloud folder — so the SQLite database, saved snippets, and clipboard
 * images sync across devices.
 *
 * Layout under whichever directory is active:
 *
 *   <dataDir>/
 *   ├── mnml.sqlite           — main DB (items, snippets, settings)
 *   ├── mnml.sqlite-wal       — SQLite WAL journal (auto-managed)
 *   ├── mnml.sqlite-shm       — SQLite shared memory (auto-managed)
 *   └── images/<sha1>.png     — clipboard image bytes
 *
 * The chosen `dataDir` itself can't live in the SQLite (chicken-and-egg).
 * So we persist it to a tiny `storage-location.json` that always lives in
 * `userData`. That's the only file permanently anchored to the local machine.
 *
 * Failure modes (graceful):
 *   - storage-location.json missing      → use userData (default)
 *   - storage-location.json points at a missing / unreadable folder
 *                                        → log warning, fall back to userData
 *   - User picks a folder that already has mnml.sqlite
 *                                        → treat the existing data as canonical
 *                                          (cross-device sync use case);
 *                                          local data left untouched at the
 *                                          previous location.
 *   - Copy fails mid-migration            → rollback to old location, surface
 *                                           an error to the renderer.
 */

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { log } from "../utils/log.js";

const LOCATION_FILE = "storage-location.json";

interface StorageLocationFile {
  /** Schema version; bump if the shape changes. */
  version: 1;
  /** Absolute path. Resolved fresh each read. */
  dataDir: string;
}

/** Resolved on first call; survives the rest of the process. */
let cachedDataDir: string | null = null;

/** Where storage-location.json lives. Always in userData. */
function locationFilePath(): string {
  return path.join(app.getPath("userData"), LOCATION_FILE);
}

/** Default data dir = userData. The unconfigured baseline. */
export function getDefaultDataDir(): string {
  return app.getPath("userData");
}

/**
 * Read the user's chosen data directory, or fall back to userData if:
 *   - storage-location.json doesn't exist, OR
 *   - it can't be parsed, OR
 *   - the configured folder doesn't exist / isn't readable.
 *
 * Result is cached for the lifetime of the process — call `setDataDir()` to
 * change it, then restart.
 */
export function getDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  const def = getDefaultDataDir();
  const file = locationFilePath();

  if (!fs.existsSync(file)) {
    cachedDataDir = def;
    return def;
  }

  let parsed: StorageLocationFile;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as StorageLocationFile;
  } catch (err) {
    log("[storage] storage-location.json unreadable, using default:", String(err));
    cachedDataDir = def;
    return def;
  }

  if (!parsed.dataDir || typeof parsed.dataDir !== "string") {
    cachedDataDir = def;
    return def;
  }

  const candidate = path.resolve(parsed.dataDir);

  // If the configured folder is missing / unreadable, fall back to default.
  // Don't lose the user's intent — keep storage-location.json intact so a
  // remount of the synced folder picks it up next launch.
  try {
    fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    log(`[storage] configured dataDir "${candidate}" inaccessible, using default. ${String(err)}`);
    cachedDataDir = def;
    return def;
  }

  cachedDataDir = candidate;
  return candidate;
}

/** True if no custom dataDir is set OR the resolved dataDir == default. */
export function isUsingDefaultDataDir(): boolean {
  return path.resolve(getDataDir()) === path.resolve(getDefaultDataDir());
}

/**
 * Probe-write a tiny file to confirm the folder is actually writable. Cleans
 * up after itself. Returns true on success, false on any error.
 */
function isWritable(dir: string): boolean {
  const probe = path.join(dir, `.mnml-probe-${Date.now()}`);
  try {
    fs.writeFileSync(probe, "ok", "utf-8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy SQLite + WAL + SHM + images dir from `src` to `dst`. Caller MUST have
 * closed the SQLite connection first. Best-effort idempotent — copying over
 * existing files of the same name is allowed (overwrite). Throws on hard
 * errors so the caller can surface them.
 */
function copyDataFiles(src: string, dst: string): void {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });

  for (const file of ["mnml.sqlite", "mnml.sqlite-wal", "mnml.sqlite-shm"]) {
    const from = path.join(src, file);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(dst, file));
  }

  const srcImages = path.join(src, "images");
  if (fs.existsSync(srcImages)) {
    const dstImages = path.join(dst, "images");
    if (!fs.existsSync(dstImages)) fs.mkdirSync(dstImages, { recursive: true });
    for (const f of fs.readdirSync(srcImages)) {
      const fromImg = path.join(srcImages, f);
      const stat = fs.statSync(fromImg);
      if (stat.isFile()) {
        fs.copyFileSync(fromImg, path.join(dstImages, f));
      }
    }
  }
}

/** Persist the new dataDir to storage-location.json. */
function writeLocationFile(absDir: string): void {
  const file = locationFilePath();
  const payload: StorageLocationFile = { version: 1, dataDir: absDir };
  // Write to a sibling temp file then rename, so a crash mid-write doesn't
  // produce a half-written JSON.
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** Delete storage-location.json so the next launch uses the default. */
export function clearLocationFile(): void {
  const file = locationFilePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  cachedDataDir = null;
}

/**
 * Migrate to a new data directory.
 *
 * Steps (all-or-nothing-ish):
 *   1. Resolve absolute path of the target. No-op if it equals current.
 *   2. Create the target if it doesn't exist; bail if not writable.
 *   3. Detect whether the target already has an `mnml.sqlite` (cross-device
 *      sync case — don't copy local over remote).
 *   4. Caller must close the SQLite connection BEFORE calling this. After
 *      this returns success, the caller restarts the app to pick up the new
 *      location.
 *   5. If the target is empty: copy SQLite + images from the current location.
 *   6. Persist storage-location.json with the new path.
 *
 * NOTE: this function does not close the DB. The caller (ipc.ts) is
 * responsible for `closeDb()` before invoking this, then restarting.
 */
export interface MigrationResult {
  ok: boolean;
  /** Set when ok=true and the new folder differs from the previous one. */
  changed?: boolean;
  /** True when the target had an existing mnml.sqlite and we adopted it. */
  adoptedExisting?: boolean;
  /** Human-readable for the renderer to show in a toast / dialog. */
  message: string;
}

export function setDataDir(targetPath: string): MigrationResult {
  const current = path.resolve(getDataDir());
  const target  = path.resolve(targetPath);

  if (current === target) {
    return { ok: true, changed: false, message: "Already using this folder." };
  }

  // 1. Ensure target exists.
  if (!fs.existsSync(target)) {
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch (err) {
      return { ok: false, message: `Couldn't create folder: ${String((err as Error).message)}` };
    }
  } else {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return { ok: false, message: "Path is not a folder." };
    }
  }

  // 2. Writable probe.
  if (!isWritable(target)) {
    return { ok: false, message: "Folder is not writable. Pick another location." };
  }

  // 3. Existing data at target?
  const targetDb = path.join(target, "mnml.sqlite");
  const adoptExisting = fs.existsSync(targetDb);

  // 4. Copy (only if target is fresh).
  if (!adoptExisting) {
    try {
      copyDataFiles(current, target);
    } catch (err) {
      return {
        ok: false,
        message: `Copy failed: ${String((err as Error).message)}. Your data is still safe at the previous location.`,
      };
    }
  }

  // 5. Persist the new location.
  try {
    writeLocationFile(target);
  } catch (err) {
    return {
      ok: false,
      message: `Couldn't save location: ${String((err as Error).message)}.`,
    };
  }

  // 6. Invalidate cache so a subsequent same-process getDataDir() reflects
  //    the change (in practice the caller restarts immediately after).
  cachedDataDir = target;

  return {
    ok: true,
    changed: true,
    adoptedExisting: adoptExisting,
    message: adoptExisting
      ? "Connected to existing mnml data in this folder."
      : "Data migrated. Restarting…",
  };
}

/** Reset to the default location. Doesn't copy data back — that's the
 *  user's call. Just clears the pointer; the data stays where it is. */
export function resetDataDir(): MigrationResult {
  const def = path.resolve(getDefaultDataDir());
  const current = path.resolve(getDataDir());

  if (current === def) {
    return { ok: true, changed: false, message: "Already using the default folder." };
  }

  try {
    clearLocationFile();
  } catch (err) {
    return { ok: false, message: `Couldn't reset: ${String((err as Error).message)}.` };
  }
  return { ok: true, changed: true, message: "Reset to default. Restarting…" };
}
