import type { Item, AppSettings, ItemType } from "../types";

// Thin wrapper over the preload IPC. Decouples the UI from window.mnml shape.

export const bridge = {
  listRecent: (limit?: number, type?: ItemType) =>
    window.mnml.listRecent(limit, type) as Promise<Item[]>,
  search: (q: string, type?: ItemType, limit?: number) =>
    window.mnml.search(q, type, limit) as Promise<Item[]>,
  restore: (id: number) => window.mnml.restore(id),
  remove: (id: number) => window.mnml.remove(id),
  clear: () => window.mnml.clear(),
  pin: (id: number, pinned: boolean) => window.mnml.pin(id, pinned),
  getImageDataUrl: (id: number) =>
    window.mnml.getImageDataUrl(id) as Promise<string | null>,
  getSettings: () => window.mnml.getSettings() as Promise<AppSettings>,
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    window.mnml.updateSetting(key, value) as Promise<AppSettings>,
  hide: () => window.mnml.hide(),
  setMode: (mode: "compact" | "expanded") => window.mnml.setMode(mode),
  setBlurLock: (locked: boolean) => window.mnml.setBlurLock(locked),
  onItemAdded: (cb: (item: Item) => void) => window.mnml.onItemAdded(cb),
  onItemUpdated: (cb: (item: Item) => void) => window.mnml.onItemUpdated(cb),
  onVisibilityChanged: (cb: (visible: boolean) => void) =>
    window.mnml.onVisibilityChanged(cb),
  onUpdateAvailable:  (cb: (version: string) => void) =>
    window.mnml.onUpdateAvailable(cb),
  onUpdateDownloaded: (cb: (version: string) => void) =>
    window.mnml.onUpdateDownloaded(cb),
  installUpdate: () => window.mnml.installUpdate(),
};
