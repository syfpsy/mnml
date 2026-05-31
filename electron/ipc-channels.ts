// Shared channel names between main and renderer.
export const IPC = {
  // ── Clipboard items ──────────────────────────────────────────────────────
  listRecent: "mnml:items:list",
  search:     "mnml:items:search",
  restore:    "mnml:items:restore",
  remove:     "mnml:items:remove",
  clear:      "mnml:items:clear",
  pin:        "mnml:items:pin",
  getImage:   "mnml:items:image",

  // ── App launcher (Start-Menu apps + Windows Settings + classic tools) ───
  appSearch:  "mnml:app:search",
  appLaunch:  "mnml:app:launch",

  // ── Saved snippets ──────────────────────────────────────────────────────
  savedList:    "mnml:saved:list",
  savedAdd:     "mnml:saved:add",
  savedUpdate:  "mnml:saved:update",
  savedRemove:  "mnml:saved:remove",
  /** Copy a saved snippet's content to the clipboard and (optionally) auto-paste. */
  savedRestore: "mnml:saved:restore",
  /** Save the currently-focused clipboard item as a snippet. */
  savedFromItem: "mnml:saved:from-item",

  // ── Settings / window / updates ─────────────────────────────────────────
  getSettings:   "mnml:settings:get",
  updateSetting: "mnml:settings:set",
  hide:          "mnml:window:hide",
  setBlurLock:   "mnml:window:blur-lock",
  installUpdate: "mnml:window:install-update",
  /** Manually trigger a check (the auto-updater also polls every 24 h). */
  checkUpdate:   "mnml:window:check-update",
  /** Returns the installed app version (matches package.json's `version`). */
  getVersion:    "mnml:app:version",

  // ── Storage folder (custom dataDir for cross-device sync) ─────────────────
  /** Returns { dataDir, defaultDir, isDefault } — current state for the UI. */
  storageGet:    "mnml:storage:get",
  /** Opens a native folder picker. Returns the absolute path or null. */
  storagePick:   "mnml:storage:pick",
  /** Migrates to a new folder + persists the choice + restarts the app. */
  storageSet:    "mnml:storage:set",
  /** Resets to the default folder + restarts the app. */
  storageReset:  "mnml:storage:reset",
  /** Opens the current dataDir in Windows Explorer. */
  storageReveal: "mnml:storage:reveal",

  // ── Events (main → renderer) ─────────────────────────────────────────────
  onItemAdded:         "mnml:event:item-added",
  onItemUpdated:       "mnml:event:item-updated",
  onVisibilityChanged: "mnml:event:visibility",
  onUpdateAvailable:   "mnml:event:update-available",
  onUpdateDownloaded:  "mnml:event:update-downloaded",
  onSavedChanged:      "mnml:event:saved-changed",
  onItemsCleared:      "mnml:event:items-cleared",
} as const;

