/**
 * app-search.ts — in-memory launcher for installed apps + Windows settings.
 *
 * No filesystem index, no SQLite, no worker. The dataset is tiny:
 *   - Start-Menu `.lnk` files (typically a few hundred entries)
 *   - The curated `WINDOWS_SHORTCUTS` list (~80 entries)
 *
 * Both are loaded once at startup into a plain `AppEntry[]` array. Search
 * is a synchronous fuzzy match against names / aliases. Icons are extracted
 * lazily via Electron's `app.getFileIcon` and cached in-process.
 *
 * Replaces the v0.2.16–v0.2.22 bulk PC-file indexer, which was too heavy
 * for the value it provided. The full filesystem search has been removed.
 */

import fs   from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { app, shell } from "electron";
import { log } from "../utils/log.js";
import { WINDOWS_SHORTCUTS } from "./windows-settings.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AppResult {
  /** Stable identifier — the launch target itself. */
  id:    string;
  /** Display label. */
  name:  string;
  /** What gets launched (path to `.lnk`, or `ms-settings:` URI, or command name). */
  target: string;
  /** "app" → Start-Menu shortcut; "setting" → ms-settings: URI; "tool" → classic Windows util. */
  kind:  "app" | "setting" | "tool";
  /** Cached PNG data-URL or null while pending. */
  icon:  string | null;
}

export interface AppSearchResponse {
  results: AppResult[];
}

// ── In-memory index ────────────────────────────────────────────────────────────

interface IndexEntry {
  id:        string;
  name:      string;
  target:    string;
  kind:      AppResult["kind"];
  /** Lowercased name for matching. */
  nameKey:   string;
  /** Lowercased aliases (already includes name + name-without-spaces). */
  aliases:   string[];
}

const SHORTCUT_DIRS = [
  path.join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs"),
  path.join(
    process.env.ProgramData ?? process.env.PROGRAMDATA ?? "C:\\ProgramData",
    "Microsoft", "Windows", "Start Menu", "Programs",
  ),
  path.join(process.env.USERPROFILE ?? "", "Desktop"),
  path.join(process.env.PUBLIC ?? "C:\\Users\\Public", "Desktop"),
];

let _index: IndexEntry[] = [];
let _indexed = false;

/**
 * Build the index. Cheap (sync .lnk walk + static list); call once at
 * startup. Idempotent — second call rebuilds in place.
 */
export function rebuildAppIndex(): void {
  if (process.platform !== "win32") {
    _indexed = true;
    return;
  }
  const startedAt = Date.now();
  const entries: IndexEntry[] = [];
  const seenNames = new Set<string>();

  // 1. Curated Windows settings + tools (static).
  for (const sc of WINDOWS_SHORTCUTS) {
    const nameKey = sc.name.toLowerCase();
    const aliases = [
      nameKey,
      nameKey.replace(/[\s\-_/&]+/g, ""),
      ...(sc.aliases ?? []).map((a) => a.toLowerCase()),
    ];
    entries.push({
      id:      sc.command,
      name:    sc.name,
      target:  sc.command,
      kind:    sc.kind,
      nameKey,
      aliases,
    });
    seenNames.add(nameKey);
  }

  // 2. Start-Menu shortcuts (.lnk).
  for (const dir of SHORTCUT_DIRS) walkLnk(dir, entries, seenNames);

  _index = entries;
  _indexed = true;
  log(`[app-search] indexed ${entries.length} entries (${WINDOWS_SHORTCUTS.length} system + ${entries.length - WINDOWS_SHORTCUTS.length} apps) in ${Date.now() - startedAt}ms`);
}

function walkLnk(dir: string, out: IndexEntry[], seen: Set<string>): void {
  if (!dir || !fs.existsSync(dir)) return;
  let dirents: fs.Dirent[];
  try { dirents = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const e of dirents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walkLnk(full, out, seen); continue; }
    if (!e.isFile() || !e.name.toLowerCase().endsWith(".lnk")) continue;

    const display = e.name.slice(0, -4).trim();
    const nameKey = display.toLowerCase();
    if (!nameKey || seen.has(nameKey)) continue;
    seen.add(nameKey);

    out.push({
      id:      full,
      name:    display,
      target:  full,
      kind:    "app",
      nameKey,
      aliases: [nameKey, nameKey.replace(/[\s\-_/&]+/g, "")],
    });
  }
}

// ── Search ─────────────────────────────────────────────────────────────────────

const MAX_RESULTS = 12;

export async function searchApps(query: string, limit = MAX_RESULTS): Promise<AppSearchResponse> {
  if (!_indexed) rebuildAppIndex();
  const q = query.trim().toLowerCase();
  if (!q) return { results: [] };

  const scored: { entry: IndexEntry; score: number }[] = [];
  for (const entry of _index) {
    const score = scoreEntry(entry, q);
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) =>
    b.score - a.score ||
    kindPriority(a.entry.kind) - kindPriority(b.entry.kind) ||
    a.entry.name.localeCompare(b.entry.name),
  );

  const top = scored.slice(0, Math.max(1, limit));
  const results: AppResult[] = await Promise.all(
    top.map(async ({ entry }) => ({
      id:     entry.id,
      name:   entry.name,
      target: entry.target,
      kind:   entry.kind,
      icon:   await getIcon(entry),
    })),
  );
  return { results };
}

function scoreEntry(entry: IndexEntry, q: string): number {
  // Best-of among aliases. Aliases include the name itself + a no-separator
  // form, so substring + acronym + subsequence checks all run uniformly.
  let best = 0;
  for (const alias of entry.aliases) {
    const s = matchScore(alias, q);
    if (s > best) best = s;
  }
  if (best === 0) return 0;
  // Slight bias: settings pages outrank tools at the same score, apps last.
  // (Reasoning: when a user types "wifi" they want the modern Settings page,
  // not a launcher hit on a `.lnk`.)
  return best;
}

function matchScore(name: string, q: string): number {
  if (name === q) return 100;
  if (name.startsWith(q)) return 85;
  if (name.includes(q)) return 70;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => name.includes(w))) return 55;
  if (words.length === 1 && acronymMatch(name, q)) return 42;
  if (q.length >= 2 && subsequenceMatch(name, q)) return 28;
  return 0;
}

function acronymMatch(name: string, q: string): boolean {
  const words = name.split(/[\s\-_]+/);
  let qi = 0;
  for (const w of words) {
    if (qi < q.length && w[0] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

function subsequenceMatch(name: string, q: string): boolean {
  let qi = 0;
  for (const ch of name) {
    if (ch === q[qi]) qi += 1;
    if (qi === q.length) return true;
  }
  return false;
}

function kindPriority(kind: AppResult["kind"]): number {
  // Settings first because they're usually the more-requested intent.
  if (kind === "setting") return 0;
  if (kind === "tool")    return 1;
  return 2;
}

// ── Icons ──────────────────────────────────────────────────────────────────────

/**
 * LRU-bounded icon cache. JavaScript's `Map` preserves insertion order, so
 * re-inserting on every hit (`set` after `get`) keeps the most-recently-used
 * entries at the tail; over the cap we evict the head. Cap chosen to cover
 * the realistic upper bound (~500 apps + ~80 settings = ~580) while still
 * imposing a hard ceiling.
 */
const ICON_CACHE_CAP = 256;
const iconCache = new Map<string, string | null>();

function rememberIcon(key: string, value: string | null): void {
  if (iconCache.has(key)) iconCache.delete(key);
  iconCache.set(key, value);
  if (iconCache.size > ICON_CACHE_CAP) {
    // Map iteration order = insertion order; first key is the oldest.
    const oldest = iconCache.keys().next().value;
    if (oldest !== undefined) iconCache.delete(oldest);
  }
}

async function getIcon(entry: IndexEntry): Promise<string | null> {
  if (iconCache.has(entry.id)) {
    const cached = iconCache.get(entry.id)!;
    // Touch — move to MRU position so it survives the next eviction sweep.
    iconCache.delete(entry.id);
    iconCache.set(entry.id, cached);
    return cached;
  }

  // For ms-settings: URIs and command-name tools, app.getFileIcon either
  // can't resolve or returns a generic icon. Skip the call — the renderer
  // shows a kind-typed glyph as a fallback.
  if (entry.kind !== "app") {
    rememberIcon(entry.id, null);
    return null;
  }

  // Walk a small list of candidate paths in priority order: the .lnk's
  // resolved target first (gives us the real app's icon), the .lnk itself
  // as a final fallback (yields the Windows shortcut overlay, which is
  // better than nothing).
  for (const candidate of iconCandidatesFor(entry.target)) {
    try {
      // "large" = 48×48 — bigger source means a crisper 24 px tile at
      // high-DPI scaling. Cached as base64; the per-entry size cost is
      // ~3–5 KB, well within the 256-entry cache budget.
      const img = await app.getFileIcon(candidate, { size: "large" });
      if (img.isEmpty()) continue;
      const url = `data:image/png;base64,${img.toPNG().toString("base64")}`;
      rememberIcon(entry.id, url);
      return url;
    } catch {
      // Try the next candidate
    }
  }

  rememberIcon(entry.id, null);
  return null;
}

/**
 * Resolve a Start-Menu `.lnk` to the icon source(s) we want to try.
 *
 * Without this, `app.getFileIcon(<.lnk path>)` returns Windows' generic
 * shortcut icon (page with a tiny arrow overlay) for every app. Real
 * icons live on the target executable.
 *
 * Returns a small ordered list:
 *   1. The `.lnk`'s target (the real .exe / image, when resolution succeeds
 *      and the target file actually exists on disk)
 *   2. The `.lnk` itself (fallback — at minimum yields *something*, even
 *      if it's the generic shortcut icon; better than a blank tile)
 *
 * UWP / Store apps whose .lnks point at a system launcher like
 * `WindowsPackageManagerLauncher.exe` will get that launcher's icon
 * (not the actual UWP app's). Reading the AppX manifest to recover the
 * real icon would require parsing AppxManifest.xml — out of scope.
 */
function iconCandidatesFor(lnkPath: string): string[] {
  const candidates: string[] = [];
  if (lnkPath.toLowerCase().endsWith(".lnk")) {
    try {
      const info = shell.readShortcutLink(lnkPath);
      if (info.target && fs.existsSync(info.target)) {
        candidates.push(info.target);
      }
    } catch {
      // readShortcutLink throws on corrupted / non-standard .lnks
    }
  }
  candidates.push(lnkPath);
  return candidates;
}

// ── Launch ─────────────────────────────────────────────────────────────────────

/** Only targets present in the startup index may be launched via IPC. */
export function isKnownLaunchTarget(target: string): boolean {
  if (!target) return false;
  if (!_indexed) rebuildAppIndex();
  return _index.some((e) => e.target === target);
}

/**
 * Launch a previously-returned target. Returns false on failure.
 *
 *   - `ms-settings:` URIs       → `shell.openExternal`
 *   - `.lnk` paths              → `shell.openPath`
 *   - bare command names + .msc/.cpl → `start "" <cmd>` via cmd.exe so the
 *                                       shell resolves PATH and registered
 *                                       handlers (mmc for .msc, control for .cpl).
 */
export async function launchAppResult(target: string): Promise<boolean> {
  if (!target) return false;
  if (!isKnownLaunchTarget(target)) {
    log(`[app-search] rejected unknown launch target: ${target.slice(0, 120)}`);
    return false;
  }

  if (target.toLowerCase().startsWith("ms-settings:")) {
    try { await shell.openExternal(target); return true; }
    catch (err) { log(`[app-search] openExternal failed: ${String(err)}`); return false; }
  }

  // Anything that looks like a filesystem path (drive-letter prefix or contains a separator).
  if (/^[a-z]:[\\/]/i.test(target) || target.includes(path.sep)) {
    const err = await shell.openPath(target);
    if (err) log(`[app-search] openPath failed: ${err}`);
    return !err;
  }

  // Bare command name — let the shell resolve PATH + registered handlers.
  const quoted = target.replace(/"/g, '""');
  return new Promise<boolean>((resolve) => {
    exec(`start "" "${quoted}"`, { windowsHide: true }, (err) => {
      if (err) {
        log(`[app-search] start failed: ${err.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
