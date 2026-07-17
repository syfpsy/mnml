import { getDb } from "./index.js";

export interface AppSettings {
  monitoring: boolean;
  maxItems: number;
  launchOnStartup: boolean;
  /** Simulate Ctrl+V after re-copying an item, so the selection lands in the focused app. */
  autoPaste: boolean;
  /** Use the light colour theme instead of the default dark one. */
  lightTheme: boolean;
}

const DEFAULTS: AppSettings = {
  monitoring: true,
  maxItems: 200,
  launchOnStartup: true,
  autoPaste: true,
  lightTheme: false,
};

/** Hard ceiling — matches IPC/UI clamp; keeps LIKE/search assumptions cheap. */
const MAX_ITEMS_CAP = 1_000;

function clampMaxItems(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.maxItems;
  return Math.min(MAX_ITEMS_CAP, Math.max(1, Math.floor(n)));
}

/** In-memory cache — warmed on first read; avoids per-call SQLite during hot paths. */
let cache: AppSettings | null = null;

function readRow<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const row = getDb()
    .prepare<[string], { value: string }>("SELECT value FROM settings WHERE key = ?")
    .get(key);
  if (!row) return DEFAULTS[key];
  try {
    return JSON.parse(row.value) as AppSettings[K];
  } catch {
    return DEFAULTS[key];
  }
}

function loadCache(): AppSettings {
  if (cache) return cache;
  const maxItems = clampMaxItems(Number(readRow("maxItems")));
  cache = {
    monitoring:      readRow("monitoring"),
    maxItems,
    launchOnStartup: readRow("launchOnStartup"),
    autoPaste:       readRow("autoPaste"),
    lightTheme:      readRow("lightTheme"),
  };
  // Persist clamp so trim()/Settings stay consistent after the old 10k ceiling.
  if (Number(readRow("maxItems")) !== maxItems) {
    getDb()
      .prepare(
        "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run("maxItems", JSON.stringify(maxItems));
  }
  return cache;
}

/** Call once after DB init so the first hot-path read doesn't hit SQLite. */
export function warmSettingsCache(): void {
  loadCache();
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return loadCache()[key];
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const next = key === "maxItems" && typeof value === "number"
    ? clampMaxItems(value) as AppSettings[K]
    : value;
  getDb()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, JSON.stringify(next));
  loadCache()[key] = next;
}

export function getAll(): AppSettings {
  return { ...loadCache() };
}
