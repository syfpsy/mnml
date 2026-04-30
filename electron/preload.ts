import { contextBridge, ipcRenderer } from "electron";
import { IPC, type WindowMode } from "./ipc-channels.js";
import type { Item, ItemType } from "./db/items.js";
import type { AppSettings } from "./db/settings.js";

const api = {
  listRecent: (limit?: number, type?: ItemType): Promise<Item[]> =>
    ipcRenderer.invoke(IPC.listRecent, { limit, type }),

  search: (query: string, type?: ItemType, limit?: number): Promise<Item[]> =>
    ipcRenderer.invoke(IPC.search, { query, type, limit }),

  restore: (id: number, paste = false): Promise<void> =>
    ipcRenderer.invoke(IPC.restore, { id, paste }),
  remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.remove, id),
  clear: (): Promise<void> => ipcRenderer.invoke(IPC.clear),
  pin: (id: number, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.pin, { id, pinned }),
  getImageDataUrl: (id: number): Promise<string | null> =>
    ipcRenderer.invoke(IPC.getImage, id),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.getSettings),
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<AppSettings> => ipcRenderer.invoke(IPC.updateSetting, { key, value }),

  hide: (): Promise<void> => ipcRenderer.invoke(IPC.hide),
  setMode: (mode: WindowMode): Promise<void> => ipcRenderer.invoke(IPC.setMode, mode),
  setBlurLock: (locked: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.setBlurLock, locked),

  onItemAdded: (cb: (item: Item) => void): (() => void) => {
    const listener = (_: unknown, item: Item) => cb(item);
    ipcRenderer.on(IPC.onItemAdded, listener);
    return () => {
      ipcRenderer.off(IPC.onItemAdded, listener);
    };
  },

  onItemUpdated: (cb: (item: Item) => void): (() => void) => {
    const listener = (_: unknown, item: Item) => cb(item);
    ipcRenderer.on(IPC.onItemUpdated, listener);
    return () => {
      ipcRenderer.off(IPC.onItemUpdated, listener);
    };
  },

  onVisibilityChanged: (cb: (visible: boolean) => void): (() => void) => {
    const listener = (_: unknown, visible: boolean) => cb(visible);
    ipcRenderer.on(IPC.onVisibilityChanged, listener);
    return () => {
      ipcRenderer.off(IPC.onVisibilityChanged, listener);
    };
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

  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.installUpdate),
};

contextBridge.exposeInMainWorld("mnml", api);

export type MnmlApi = typeof api;
