/** Shared platform constants for main + renderer (via IPC). */

export const IS_WIN = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";

/** Global fallback when double-tap summon is unavailable. */
export const FALLBACK_SHORTCUT = IS_MAC ? "Command+Shift+V" : "Control+Shift+V";

export const PLATFORM_UI = {
  summonHint: IS_MAC ? "Option Option" : "Alt Alt",
  pasteRowHint: IS_MAC ? "⌘1-9 paste" : "Ctrl 1-9 paste",
  pasteChord: IS_MAC ? "⌘V" : "Ctrl+V",
  launchOnStartupHint: IS_MAC
    ? "Open at login so the hotkey always works."
    : "Start with Windows so the hotkey always works.",
  osName: IS_MAC ? "macOS" : "Windows",
} as const;
