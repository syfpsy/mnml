import type { Item, AppSettings, ItemType, AppSearchResponse, SavedSnippet } from "../types";

// Thin wrapper over the preload IPC. Decouples the UI from window.mnml shape.

export const bridge = {
  // ── Clipboard items ────────────────────────────────────────────────────
  listRecent: (limit?: number, type?: ItemType) =>
    window.mnml.listRecent(limit, type) as Promise<Item[]>,
  search: (q: string, type?: ItemType, limit?: number) =>
    window.mnml.search(q, type, limit) as Promise<Item[]>,
  restore: (id: number, paste = false) => window.mnml.restore(id, paste),
  remove:  (id: number) => window.mnml.remove(id),
  clear:   () => window.mnml.clear(),
  pin:     (id: number, pinned: boolean) => window.mnml.pin(id, pinned),
  getImageDataUrl: (id: number) =>
    window.mnml.getImageDataUrl(id) as Promise<string | null>,

  // ── App launcher (apps + Windows settings + classic tools) ─────────────
  appSearch: (q: string) =>
    window.mnml.appSearch(q) as Promise<AppSearchResponse>,
  appLaunch: (target: string) =>
    window.mnml.appLaunch(target) as Promise<boolean>,

  // ── Saved snippets ──────────────────────────────────────────────────────
  savedList:    () => window.mnml.savedList() as Promise<SavedSnippet[]>,
  savedAdd:     (label: string, content: string) =>
    window.mnml.savedAdd(label, content) as Promise<SavedSnippet>,
  savedUpdate:  (id: number, label: string, content: string) =>
    window.mnml.savedUpdate(id, label, content) as Promise<void>,
  savedRemove:  (id: number) => window.mnml.savedRemove(id) as Promise<void>,
  savedRestore: (id: number, paste = false) =>
    window.mnml.savedRestore(id, paste) as Promise<void>,
  savedFromItem: (itemId: number, label?: string) =>
    window.mnml.savedFromItem(itemId, label) as Promise<SavedSnippet | null>,

  // ── Settings / window / updates ─────────────────────────────────────────
  getSettings:   () => window.mnml.getSettings() as Promise<AppSettings>,
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    window.mnml.updateSetting(key, value) as Promise<AppSettings>,
  hide:        () => window.mnml.hide(),
  setBlurLock: (locked: boolean) => window.mnml.setBlurLock(locked),

  // ── Events ──────────────────────────────────────────────────────────────
  onItemAdded:        (cb: (item: Item) => void) => window.mnml.onItemAdded(cb),
  onItemUpdated:      (cb: (item: Item) => void) => window.mnml.onItemUpdated(cb),
  onVisibilityChanged: (cb: (visible: boolean) => void) => window.mnml.onVisibilityChanged(cb),
  onUpdateAvailable:  (cb: (version: string) => void) => window.mnml.onUpdateAvailable(cb),
  onUpdateDownloaded: (cb: (version: string) => void) => window.mnml.onUpdateDownloaded(cb),
  onSavedChanged:     (cb: () => void) => window.mnml.onSavedChanged(cb),
  installUpdate:      () => window.mnml.installUpdate(),
  checkUpdate:        () => window.mnml.checkUpdate() as Promise<{
    ok: boolean; available?: boolean; version?: string | null; message?: string;
  }>,
  getVersion:         () => window.mnml.getVersion() as Promise<string>,

  // ── Storage folder ──────────────────────────────────────────────────────
  storageGet:    () => window.mnml.storageGet() as Promise<{
    dataDir: string; defaultDir: string; isDefault: boolean;
  }>,
  storagePick:   () => window.mnml.storagePick() as Promise<string | null>,
  storageSet:    (path: string) => window.mnml.storageSet(path) as Promise<{
    ok: boolean; message: string; adoptedExisting?: boolean;
  }>,
  storageReset:  () => window.mnml.storageReset() as Promise<{ ok: boolean; message: string }>,
  storageReveal: () => window.mnml.storageReveal() as Promise<boolean>,
};
