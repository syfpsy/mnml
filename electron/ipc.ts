import { ipcMain, app, BrowserWindow, dialog, nativeImage, shell } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import { IPC } from "./ipc-channels.js";
import {
  clearAll,
  deleteById,
  getById,
  listRecent,
  setPinned,
  type ItemType,
} from "./db/items.js";
import { closeDb } from "./db/index.js";
import { getDataDir, getDefaultDataDir, isUsingDefaultDataDir, setDataDir, resetDataDir } from "./db/data-dir.js";
import { getAll as getAllSettings, getSetting, setSetting, type AppSettings } from "./db/settings.js";
import { addSaved, deleteSaved, getSavedById, listSaved, touchSaved, updateSaved, type SavedSnippet } from "./db/saved.js";
import { search } from "./search/service.js";
import { launchAppResult, searchApps, type AppSearchResponse } from "./search/app-search.js";
import { restoreItem, restoreText, start as startMonitor, stop as stopMonitor } from "./clipboard/monitor.js";
import { log } from "./utils/log.js";

interface WindowControl {
  hide: () => void;
  setBlurLock: (locked: boolean) => void;
  setPastePending: () => void;
}

function broadcastSavedChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || w.webContents.isDestroyed()) continue;
    try { w.webContents.send(IPC.onSavedChanged); }
    catch (err) { log("[ipc] saved-changed broadcast failed:", String(err)); }
  }
}

function broadcastItemsCleared() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || w.webContents.isDestroyed()) continue;
    try { w.webContents.send(IPC.onItemsCleared); }
    catch (err) { log("[ipc] items-cleared broadcast failed:", String(err)); }
  }
}

export function registerIpc(windowControl: WindowControl) {
  // ── Clipboard items ───────────────────────────────────────────────────────

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

  // Image thumbnails are tiny (24 px in compact rows, max ~96 px in any UI),
  // so sending the full-resolution PNG over IPC and into the renderer's React
  // state was the dominant source of renderer-side memory bloat — a 25-item
  // history of 4 K screenshots cached ~100 MB of base64 strings in the DOM.
  // Resize to a small thumbnail in the main process and LRU-cache the
  // encoded result, keyed by item id.
  const THUMB_SIZE     = 96;
  const THUMB_CACHE_CAP = 64;
  const thumbCache     = new Map<number, string>();
  const rememberThumb  = (id: number, dataUrl: string) => {
    if (thumbCache.has(id)) thumbCache.delete(id);
    thumbCache.set(id, dataUrl);
    if (thumbCache.size > THUMB_CACHE_CAP) {
      const oldest = thumbCache.keys().next().value;
      if (oldest !== undefined) thumbCache.delete(oldest);
    }
  };

  ipcMain.handle(IPC.restore, (_, { id, paste = false }: { id: number; paste?: boolean }) => {
    const item = getById(id);
    if (item) {
      restoreItem(item);
      if (paste && getSetting("autoPaste")) windowControl.setPastePending();
    }
  });

  ipcMain.handle(IPC.remove, (_, id: number) => {
    deleteById(id);
    thumbCache.delete(id);
  });
  ipcMain.handle(IPC.clear, () => {
    clearAll();
    thumbCache.clear();
    broadcastItemsCleared();
  });
  ipcMain.handle(IPC.pin,    (_, { id, pinned }: { id: number; pinned: boolean }) =>
    setPinned(id, pinned),
  );

  ipcMain.handle(IPC.getImage, (_, id: number): string | null => {
    if (thumbCache.has(id)) {
      const cached = thumbCache.get(id)!;
      thumbCache.delete(id); thumbCache.set(id, cached); // touch
      return cached;
    }
    const item = getById(id);
    if (!item || item.type !== "image" || !item.image_path) return null;
    if (!fs.existsSync(item.image_path)) return null;
    try {
      const img  = nativeImage.createFromPath(item.image_path);
      if (img.isEmpty()) return null;
      const { width, height } = img.getSize();
      // Preserve aspect: scale so the larger side hits THUMB_SIZE.
      const scaled =
        width > THUMB_SIZE || height > THUMB_SIZE
          ? img.resize(width >= height
              ? { width: THUMB_SIZE, quality: "good" }
              : { height: THUMB_SIZE, quality: "good" })
          : img;
      const url = `data:image/png;base64,${scaled.toPNG().toString("base64")}`;
      rememberThumb(id, url);
      return url;
    } catch {
      return null;
    }
  });

  // ── App launcher (Start-Menu apps + Windows Settings + classic tools) ────

  ipcMain.handle(
    IPC.appSearch,
    async (_, { query }: { query: string }): Promise<AppSearchResponse> => {
      const q = query?.trim() ?? "";
      if (!q) return { results: [] };
      return searchApps(q, 12);
    },
  );

  ipcMain.handle(
    IPC.appLaunch,
    async (_, { target }: { target: string }) => launchAppResult(target),
  );

  // ── Saved snippets ────────────────────────────────────────────────────────

  ipcMain.handle(IPC.savedList, (): SavedSnippet[] => listSaved());

  ipcMain.handle(
    IPC.savedAdd,
    (_, { label, content }: { label: string; content: string }): SavedSnippet => {
      const created = addSaved(label, content);
      broadcastSavedChanged();
      return created;
    },
  );

  ipcMain.handle(
    IPC.savedUpdate,
    (_, { id, label, content }: { id: number; label: string; content: string }) => {
      updateSaved(id, label, content);
      broadcastSavedChanged();
    },
  );

  ipcMain.handle(IPC.savedRemove, (_, id: number) => {
    deleteSaved(id);
    broadcastSavedChanged();
  });

  ipcMain.handle(
    IPC.savedRestore,
    (_, { id, paste = false }: { id: number; paste?: boolean }) => {
      const snippet = getSavedById(id);
      if (!snippet) return;
      restoreText(snippet.content);
      touchSaved(id);
      broadcastSavedChanged();
      if (paste && getSetting("autoPaste")) windowControl.setPastePending();
    },
  );

  ipcMain.handle(
    IPC.savedFromItem,
    (_, { itemId, label }: { itemId: number; label?: string }): SavedSnippet | null => {
      const item = getById(itemId);
      if (!item) return null;
      const content = item.content_text ?? item.content_url ?? item.preview;
      if (!content) return null;
      const created = addSaved(label ?? "", content);
      broadcastSavedChanged();
      return created;
    },
  );

  // ── Settings / window / updates ──────────────────────────────────────────

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
  ipcMain.handle(IPC.setBlurLock, (_, locked: boolean) =>
    windowControl.setBlurLock(locked),
  );
  ipcMain.handle(IPC.installUpdate, () => {
    autoUpdater.quitAndInstall(false /* isSilent */, true /* isForceRunAfter */);
  });

  ipcMain.handle(IPC.getVersion, (): string => app.getVersion());
  ipcMain.handle(IPC.checkUpdate, async () => {
    // Returns a short summary the renderer can show ("checking" / "no update" /
    // "available v0.2.30"). The real update lifecycle still flows through the
    // existing autoUpdater event subscriptions in main.ts.
    try {
      const r = await autoUpdater.checkForUpdates();
      if (!r) return { ok: false, message: "Updates disabled (dev build)" } as const;

      // electron-updater's `updateInfo.version` is the server's LATEST
      // version regardless of whether it's newer than the installed one —
      // checking `!!updateInfo.version` was the bug that made every check
      // report "Update ready" even on the latest build. `downloadPromise`
      // is the authoritative indicator: it's only set when the server
      // version actually exceeds the installed version (and autoDownload
      // is enabled, which it is — see setupAutoUpdater in main.ts).
      const available = !!r.downloadPromise;
      const ver = r.updateInfo?.version ?? null;
      return { ok: true, available, version: available ? ver : null } as const;
    } catch (err) {
      return { ok: false, message: String((err as Error)?.message ?? err) } as const;
    }
  });

  // ── Storage folder ──────────────────────────────────────────────────────
  // The user can re-point mnml's persistent data to any local folder —
  // typically a Dropbox / OneDrive / iCloud folder for cross-device sync.

  ipcMain.handle(IPC.storageGet, () => ({
    dataDir:    getDataDir(),
    defaultDir: getDefaultDataDir(),
    isDefault:  isUsingDefaultDataDir(),
  }));

  ipcMain.handle(IPC.storagePick, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win!, {
      title: "Choose a folder for mnml data",
      message:
        "Pick a folder (e.g. inside Dropbox or OneDrive) to keep your clipboard history, snippets, and images. Existing mnml data in the picked folder will be used as-is.",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
      defaultPath: getDataDir(),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC.storageSet,
    async (_, targetPath: string): Promise<{ ok: boolean; changed: boolean; message: string; adoptedExisting?: boolean }> => {
      log(`[storage] migration requested: ${targetPath}`);

      // Capture the monitoring preference BEFORE we close the DB, so we
      // know whether to restart the poller on rollback. Otherwise we'd
      // unconditionally start it on failure — bad for users who'd
      // explicitly disabled monitoring (timer fires every 500 ms doing
      // nothing).
      const monitoringWasOn = Boolean(getSetting("monitoring"));

      // Stop the clipboard timer FIRST so no in-flight poll can reopen
      // the DB connection we're about to release. Order is load-bearing.
      stopMonitor();
      closeDb();

      const result = setDataDir(targetPath);
      if (!result.ok) {
        // Migration aborted — reopen the original setup so the running
        // app keeps working until the user retries.
        if (monitoringWasOn) startMonitor();
        return { ok: false, changed: false, message: result.message };
      }
      if (!result.changed) {
        // The picked folder equals the current one — no-op. Resume the
        // monitor and tell the renderer NOT to expect a restart so it
        // can clear its "Migrating…" state.
        if (monitoringWasOn) startMonitor();
        return { ok: true, changed: false, message: result.message };
      }

      log(`[storage] migration ok, restarting. adoptedExisting=${!!result.adoptedExisting}`);

      // Restart so the renderer + main reload against the new dataDir.
      // 600 ms gives the IPC reply enough time to make it back to the
      // renderer so the user sees the "Restarting…" confirmation.
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 600);

      return { ok: true, changed: true, message: result.message, adoptedExisting: result.adoptedExisting };
    },
  );

  ipcMain.handle(IPC.storageReset, async (): Promise<{ ok: boolean; changed: boolean; message: string }> => {
    const monitoringWasOn = Boolean(getSetting("monitoring"));
    stopMonitor();
    closeDb();
    const result = resetDataDir();
    if (!result.ok) {
      if (monitoringWasOn) startMonitor();
      return { ok: false, changed: false, message: result.message };
    }
    if (!result.changed) {
      if (monitoringWasOn) startMonitor();
      return { ok: true, changed: false, message: result.message };
    }
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 600);
    return { ok: true, changed: true, message: result.message };
  });

  ipcMain.handle(IPC.storageReveal, async () => {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) return false;
    await shell.openPath(dir);
    return true;
  });
}
