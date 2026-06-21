import { ipcMain, app, BrowserWindow, dialog, shell, type OpenDialogOptions } from "electron";
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
import { evictAllThumbs, evictThumb, getThumbDataUrl } from "./thumb-cache.js";
import { log } from "./utils/log.js";
import { PLATFORM_UI } from "./platform/config.js";

interface WindowControl {
  hide: () => void;
  setBlurLock: (locked: boolean) => void;
  setPastePending: () => void;
  armPasteActivation: () => void;
  cancelPasteActivation: () => void;
  suppressBlurHide: () => void;
}

/**
 * paste:true = user activated a row (click / Enter / quick-paste).
 * When autoPaste is off, clipboard is already updated — stay open.
 * Shift-click passes paste:false and returns immediately.
 */
function preparePasteActivate(paste: boolean, windowControl: WindowControl) {
  if (!paste || !getSetting("autoPaste")) return;
  windowControl.suppressBlurHide();
  windowControl.armPasteActivation();
}

/** Copy-only restore still touches clipboard — brief suppress avoids blur dismiss. */
function prepareCopyOnlyRestore(windowControl: WindowControl) {
  windowControl.suppressBlurHide();
}

function finishActivate(paste: boolean, windowControl: WindowControl) {
  if (!paste) return;
  if (!getSetting("autoPaste")) return;
  windowControl.suppressBlurHide();
  windowControl.hide();
}

function clampListLimit(limit: unknown, fallback: number, max = 500): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
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

function requirePositiveInt(id: unknown): number | null {
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
  return n;
}

export function registerIpc(windowControl: WindowControl) {
  // ── Clipboard items ───────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.listRecent,
    (_, { limit, type }: { limit?: number; type?: ItemType }) =>
      listRecent(clampListLimit(limit, 10), type),
  );

  ipcMain.handle(
    IPC.search,
    (_, { query, type, limit }: { query: string; type?: ItemType; limit?: number }) => {
      const scored = search(query ?? "", { limit: clampListLimit(limit, 50), type });
      return scored.map((s) => s.item);
    },
  );

  ipcMain.handle(IPC.restore, (_, { id, paste = false }: { id: number; paste?: boolean }) => {
    if (paste) preparePasteActivate(paste, windowControl);
    else prepareCopyOnlyRestore(windowControl);
    const itemId = requirePositiveInt(id);
    if (!itemId) {
      if (paste) windowControl.cancelPasteActivation();
      return;
    }
    const item = getById(itemId);
    if (!item) {
      if (paste) windowControl.cancelPasteActivation();
      return;
    }
    if (!restoreItem(item)) {
      if (paste) windowControl.cancelPasteActivation();
      return;
    }
    finishActivate(paste, windowControl);
  });

  ipcMain.handle(IPC.remove, (_, id: number) => {
    const itemId = requirePositiveInt(id);
    if (!itemId) return;
    deleteById(itemId);
    evictThumb(itemId);
  });
  ipcMain.handle(IPC.clear, () => {
    clearAll();
    evictAllThumbs();
    broadcastItemsCleared();
  });
  ipcMain.handle(IPC.pin,    (_, { id, pinned }: { id: number; pinned: boolean }) => {
    const itemId = requirePositiveInt(id);
    if (!itemId) return;
    setPinned(itemId, pinned);
  });

  ipcMain.handle(IPC.getImage, (_, id: number): string | null => {
    const itemId = requirePositiveInt(id);
    if (!itemId) return null;
    return getThumbDataUrl(itemId);
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
      const snippetId = requirePositiveInt(id);
      if (!snippetId) return;
      updateSaved(snippetId, label, content);
      broadcastSavedChanged();
    },
  );

  ipcMain.handle(IPC.savedRemove, (_, id: number) => {
    const snippetId = requirePositiveInt(id);
    if (!snippetId) return;
    deleteSaved(snippetId);
    broadcastSavedChanged();
  });

  ipcMain.handle(
    IPC.savedRestore,
    (_, { id, paste = false }: { id: number; paste?: boolean }) => {
      if (paste) preparePasteActivate(paste, windowControl);
      else prepareCopyOnlyRestore(windowControl);
      const snippetId = requirePositiveInt(id);
      if (!snippetId) {
        if (paste) windowControl.cancelPasteActivation();
        return;
      }
      const snippet = getSavedById(snippetId);
      if (!snippet) {
        if (paste) windowControl.cancelPasteActivation();
        return;
      }
      restoreText(snippet.content);
      touchSaved(snippetId);
      broadcastSavedChanged();
      finishActivate(paste, windowControl);
    },
  );

  ipcMain.handle(
    IPC.savedFromItem,
    (_, { itemId, label }: { itemId: number; label?: string }): SavedSnippet | null => {
      const id = requirePositiveInt(itemId);
      if (!id) return null;
      const item = getById(id);
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
      let next = value;
      if (key === "maxItems" && typeof value === "number") {
        next = Math.min(10_000, Math.max(1, Math.floor(value))) as AppSettings["maxItems"];
      }
      setSetting(key, next as never);
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
  ipcMain.handle(IPC.suppressBlurHide, () => windowControl.suppressBlurHide());
  ipcMain.handle(IPC.installUpdate, () => {
    autoUpdater.quitAndInstall(false /* isSilent */, true /* isForceRunAfter */);
  });

  ipcMain.handle(IPC.getVersion, (): string => app.getVersion());
  ipcMain.handle(IPC.getPlatformUi, () => ({
    platform: process.platform,
    ...PLATFORM_UI,
  }));
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
    const parent =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    const opts: OpenDialogOptions = {
      title: "Choose a folder for mnml data",
      message:
        "Pick a folder (e.g. inside Dropbox or OneDrive) to keep your clipboard history, snippets, and images. Existing mnml data in the picked folder will be used as-is.",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
      defaultPath: getDataDir(),
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, opts)
      : await dialog.showOpenDialog(opts);
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
    if (process.platform === "darwin") {
      shell.showItemInFolder(dir);
      return true;
    }
    await shell.openPath(dir);
    return true;
  });
}
