import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./ipc-channels.js";
import type { Item, ItemType } from "./db/items.js";
import type { AppSettings } from "./db/settings.js";
import type { SavedSnippet } from "./db/saved.js";
import type { AppSearchResponse } from "./search/app-search.js";

const api = {
  // ── Clipboard items ────────────────────────────────────────────────────
  listRecent: (limit?: number, type?: ItemType): Promise<Item[]> =>
    ipcRenderer.invoke(IPC.listRecent, { limit, type }),

  search: (query: string, type?: ItemType, limit?: number): Promise<Item[]> =>
    ipcRenderer.invoke(IPC.search, { query, type, limit }),

  restore: (id: number, paste = false): Promise<void> =>
    ipcRenderer.invoke(IPC.restore, { id, paste }),
  remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.remove, id),
  clear:  (): Promise<void> => ipcRenderer.invoke(IPC.clear),
  pin:    (id: number, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.pin, { id, pinned }),
  getImageDataUrl: (id: number): Promise<string | null> =>
    ipcRenderer.invoke(IPC.getImage, id),

  // ── App launcher ────────────────────────────────────────────────────────
  appSearch: (query: string): Promise<AppSearchResponse> =>
    ipcRenderer.invoke(IPC.appSearch, { query }),
  appLaunch: (target: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.appLaunch, { target }),

  // ── Saved snippets ──────────────────────────────────────────────────────
  savedList: (): Promise<SavedSnippet[]> => ipcRenderer.invoke(IPC.savedList),
  savedAdd:  (label: string, content: string): Promise<SavedSnippet> =>
    ipcRenderer.invoke(IPC.savedAdd, { label, content }),
  savedUpdate: (id: number, label: string, content: string): Promise<void> =>
    ipcRenderer.invoke(IPC.savedUpdate, { id, label, content }),
  savedRemove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.savedRemove, id),
  savedRestore: (id: number, paste = false): Promise<void> =>
    ipcRenderer.invoke(IPC.savedRestore, { id, paste }),
  savedFromItem: (itemId: number, label?: string): Promise<SavedSnippet | null> =>
    ipcRenderer.invoke(IPC.savedFromItem, { itemId, label }),

  // ── Settings / window / updates ─────────────────────────────────────────
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.getSettings),
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<AppSettings> => ipcRenderer.invoke(IPC.updateSetting, { key, value }),

  hide:    (): Promise<void> => ipcRenderer.invoke(IPC.hide),
  setBlurLock: (locked: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.setBlurLock, locked),

  // ── Events ──────────────────────────────────────────────────────────────
  onItemAdded: (cb: (item: Item) => void): (() => void) => {
    const listener = (_: unknown, item: Item) => cb(item);
    ipcRenderer.on(IPC.onItemAdded, listener);
    return () => { ipcRenderer.off(IPC.onItemAdded, listener); };
  },

  onItemUpdated: (cb: (item: Item) => void): (() => void) => {
    const listener = (_: unknown, item: Item) => cb(item);
    ipcRenderer.on(IPC.onItemUpdated, listener);
    return () => { ipcRenderer.off(IPC.onItemUpdated, listener); };
  },

  onVisibilityChanged: (cb: (visible: boolean) => void): (() => void) => {
    const listener = (_: unknown, visible: boolean) => cb(visible);
    ipcRenderer.on(IPC.onVisibilityChanged, listener);
    return () => { ipcRenderer.off(IPC.onVisibilityChanged, listener); };
  },

  onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
    const listener = (_: unknown, version: string) => cb(version);
    ipcRenderer.on(IPC.onUpdateAvailable, listener);
    return () => { ipcRenderer.off(IPC.onUpdateAvailable, listener); };
  },

  onUpdateDownloaded: (cb: (version: string) => void): (() => void) => {
    const listener = (_: unknown, version: string) => cb(version);
    ipcRenderer.on(IPC.onUpdateDownloaded, listener);
    return () => { ipcRenderer.off(IPC.onUpdateDownloaded, listener); };
  },

  onSavedChanged: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.onSavedChanged, listener);
    return () => { ipcRenderer.off(IPC.onSavedChanged, listener); };
  },

  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.installUpdate),
  checkUpdate:   (): Promise<{ ok: boolean; available?: boolean; version?: string | null; message?: string }> =>
    ipcRenderer.invoke(IPC.checkUpdate),
  getVersion:    (): Promise<string> => ipcRenderer.invoke(IPC.getVersion),

  // ── Storage folder ──────────────────────────────────────────────────────
  storageGet:    (): Promise<{ dataDir: string; defaultDir: string; isDefault: boolean }> =>
    ipcRenderer.invoke(IPC.storageGet),
  storagePick:   (): Promise<string | null> => ipcRenderer.invoke(IPC.storagePick),
  storageSet:    (targetPath: string): Promise<{ ok: boolean; changed: boolean; message: string; adoptedExisting?: boolean }> =>
    ipcRenderer.invoke(IPC.storageSet, targetPath),
  storageReset:  (): Promise<{ ok: boolean; changed: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.storageReset),
  storageReveal: (): Promise<boolean> => ipcRenderer.invoke(IPC.storageReveal),
};

contextBridge.exposeInMainWorld("mnml", api);

export type MnmlApi = typeof api;
