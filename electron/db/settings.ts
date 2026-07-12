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
  cache = {
    monitoring:      readRow("monitoring"),
    maxItems:        readRow("maxItems"),
    launchOnStartup: readRow("launchOnStartup"),
    autoPaste:       readRow("autoPaste"),
    lightTheme:      readRow("lightTheme"),
  };
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
  getDb()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, JSON.stringify(value));
  loadCache()[key] = value;
}

export function getAll(): AppSettings {
  return { ...loadCache() };
}
