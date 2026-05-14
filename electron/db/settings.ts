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
  launchOnStartup: false,
  autoPaste: true,
  lightTheme: false,
};

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
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

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  getDb()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, JSON.stringify(value));
}

export function getAll(): AppSettings {
  return {
    monitoring:      getSetting("monitoring"),
    maxItems:        getSetting("maxItems"),
    launchOnStartup: getSetting("launchOnStartup"),
    autoPaste:       getSetting("autoPaste"),
    lightTheme:      getSetting("lightTheme"),
  };
}
