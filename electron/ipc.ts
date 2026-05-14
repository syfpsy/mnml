import { ipcMain, app, BrowserWindow, nativeImage } from "electron";
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
import { getAll as getAllSettings, getSetting, setSetting, type AppSettings } from "./db/settings.js";
import { addSaved, deleteSaved, getSavedById, listSaved, touchSaved, updateSaved, type SavedSnippet } from "./db/saved.js";
import { search } from "./search/service.js";
import { launchAppResult, searchApps, type AppSearchResponse } from "./search/app-search.js";
import { restoreItem, restoreText, start as startMonitor, stop as stopMonitor } from "./clipboard/monitor.js";

interface WindowControl {
  hide: () => void;
  setBlurLock: (locked: boolean) => void;
  setPastePending: () => void;
}

function broadcastSavedChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.onSavedChanged);
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

  ipcMain.handle(IPC.restore, (_, { id, paste = false }: { id: number; paste?: boolean }) => {
    const item = getById(id);
    if (item) {
      restoreItem(item);
      if (paste && getSetting("autoPaste")) windowControl.setPastePending();
    }
  });

  ipcMain.handle(IPC.remove, (_, id: number) => deleteById(id));
  ipcMain.handle(IPC.clear,  () => clearAll());
  ipcMain.handle(IPC.pin,    (_, { id, pinned }: { id: number; pinned: boolean }) =>
    setPinned(id, pinned),
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
  ipcMain.handle(IPC.checkUpdate, async () => {
    // Returns a short summary the renderer can show ("checking" / "no update" /
    // "available v0.2.30"). The real update lifecycle still flows through the
    // existing autoUpdater event subscriptions in main.ts.
    try {
      const r = await autoUpdater.checkForUpdates();
      if (!r) return { ok: false, message: "Updates disabled (dev build)" } as const;
      const ver = r.updateInfo?.version;
      // electron-updater's checkForUpdates resolves once it knows whether an
      // update exists. If `autoDownload` is on (it is), the download starts
      // immediately and the `update-downloaded` event fires later, which the
      // renderer already listens for via UpdateBanner.
      return { ok: true, available: !!ver, version: ver ?? null } as const;
    } catch (err) {
      return { ok: false, message: String((err as Error)?.message ?? err) } as const;
    }
  });
}
