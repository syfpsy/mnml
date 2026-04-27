// Shared channel names between main and renderer.
export const IPC = {
  listRecent: "mnml:items:list",
  search: "mnml:items:search",
  restore: "mnml:items:restore",
  remove: "mnml:items:remove",
  clear: "mnml:items:clear",
  pin: "mnml:items:pin",
  getImage: "mnml:items:image",
  getSettings: "mnml:settings:get",
  updateSetting: "mnml:settings:set",
  hide: "mnml:window:hide",
  setMode: "mnml:window:mode", // "compact" | "expanded"
  setBlurLock: "mnml:window:blur-lock",
  onItemAdded: "mnml:event:item-added",
  onItemUpdated: "mnml:event:item-updated",
  onVisibilityChanged: "mnml:event:visibility",
  onUpdateAvailable:   "mnml:event:update-available",
  onUpdateDownloaded:  "mnml:event:update-downloaded",
  installUpdate: "mnml:window:install-update",
} as const;

export type WindowMode = "compact" | "expanded";
