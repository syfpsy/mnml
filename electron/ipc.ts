import { ipcMain, app } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import { IPC, type WindowMode } from "./ipc-channels.js";
import {
  clearAll,
  deleteById,
  getById,
  listRecent,
  setPinned,
  type ItemType,
} from "./db/items.js";
import { getAll as getAllSettings, getSetting, setSetting, type AppSettings } from "./db/settings.js";
import { search, markIndexDirty } from "./search/service.js";
import { restoreItem, start as startMonitor, stop as stopMonitor } from "./clipboard/monitor.js";

interface WindowControl {
  hide: () => void;
  setMode: (mode: WindowMode) => void;
  setBlurLock: (locked: boolean) => void;
  setPastePending: () => void;
}

export function registerIpc(windowControl: WindowControl) {
  ipcMain.handle(
    IPC.listRecent,
    (_, { limit, type }: { limit?: number; type?: ItemType }) =>
      listRecent(limit ?? 10, type),
  );

  ipcMain.handle(
    IPC.search,
    (_, { query, type, limit }: { query: string; type?: ItemType; limit?: number }) => {
      const scored = search(query ?? "", { limit: limit ?? 50, type });
      return scored.map((s) => s.item);
    },
  );

  ipcMain.handle(IPC.restore, (_, id: number) => {
    const item = getById(id);
    if (item) {
      restoreItem(item);
      if (getSetting("autoPaste")) windowControl.setPastePending();
    }
  });

  ipcMain.handle(IPC.remove, (_, id: number) => {
    deleteById(id);
    markIndexDirty();
  });

  ipcMain.handle(IPC.clear, () => {
    clearAll();
    markIndexDirty();
  });

  ipcMain.handle(IPC.pin, (_, { id, pinned }: { id: number; pinned: boolean }) => {
    setPinned(id, pinned);
    markIndexDirty();
  });

  ipcMain.handle(IPC.getImage, (_, id: number) => {
    const item = getById(id);
    if (!item || item.type !== "image" || !item.image_path) return null;
    if (!fs.existsSync(item.image_path)) return null;
    const buf = fs.readFileSync(item.image_path);
    return `data:image/png;base64,${buf.toString("base64")}`;
  });

  ipcMain.handle(IPC.getSettings, () => getAllSettings());

  ipcMain.handle(
    IPC.updateSetting,
    (_, { key, value }: { key: keyof AppSettings; value: AppSettings[keyof AppSettings] }) => {
      setSetting(key, value as never);
      if (key === "monitoring") {
        if (value) startMonitor();
        else stopMonitor();
      }
      if (key === "launchOnStartup") {
        app.setLoginItemSettings({ openAtLogin: Boolean(value) });
      }
      return getAllSettings();
    },
  );

  ipcMain.handle(IPC.hide, () => windowControl.hide());
  ipcMain.handle(IPC.setMode, (_, mode: WindowMode) => {
    setSetting("windowMode", mode);
    windowControl.setMode(mode);
  });
  ipcMain.handle(IPC.setBlurLock, (_, locked: boolean) =>
    windowControl.setBlurLock(locked),
  );
  ipcMain.handle(IPC.installUpdate, () => {
    autoUpdater.quitAndInstall(false /* isSilent */, true /* isForceRunAfter */);
  });
}
