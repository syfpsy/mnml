/**
 * Curated macOS System Settings / utility launch targets.
 * `command` values are passed to `open` or `shell.openExternal`.
 */

export type MacShortcutKind = "app" | "setting" | "tool";

export interface MacShortcut {
  name: string;
  command: string;
  kind: MacShortcutKind;
  aliases?: string[];
}

export const MACOS_SHORTCUTS: MacShortcut[] = [
  { name: "System Settings", command: "x-apple.systempreferences:", kind: "setting", aliases: ["preferences", "settings", "system"] },
  { name: "Bluetooth", command: "x-apple.systempreferences:com.apple.BluetoothSettings", kind: "setting", aliases: ["bluetooth"] },
  { name: "Wi-Fi", command: "x-apple.systempreferences:com.apple.wifi-settings-extension", kind: "setting", aliases: ["wifi", "wireless", "network"] },
  { name: "Displays", command: "x-apple.systempreferences:com.apple.Displays-Settings.extension", kind: "setting", aliases: ["display", "monitor", "screen"] },
  { name: "Sound", command: "x-apple.systempreferences:com.apple.Sound-Settings.extension", kind: "setting", aliases: ["audio", "volume", "speakers"] },
  { name: "Keyboard", command: "x-apple.systempreferences:com.apple.Keyboard-Settings.extension", kind: "setting", aliases: ["keys", "shortcuts"] },
  { name: "Trackpad", command: "x-apple.systempreferences:com.apple.Trackpad-Settings.extension", kind: "setting", aliases: ["mouse", "gestures"] },
  { name: "Privacy & Security", command: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension", kind: "setting", aliases: ["privacy", "security", "permissions"] },
  { name: "Accessibility", command: "x-apple.systempreferences:com.apple.Accessibility-Settings.extension", kind: "setting", aliases: ["accessibility", "a11y"] },
  { name: "Login Items", command: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension", kind: "setting", aliases: ["startup", "login", "open at login"] },
  { name: "Storage", command: "x-apple.systempreferences:com.apple.settings.Storage", kind: "setting", aliases: ["disk", "space"] },
  { name: "Battery", command: "x-apple.systempreferences:com.apple.Battery-Settings.extension", kind: "setting", aliases: ["power", "energy"] },
  { name: "Date & Time", command: "x-apple.systempreferences:com.apple.preference.datetime", kind: "setting", aliases: ["clock", "timezone"] },
  { name: "Users & Groups", command: "x-apple.systempreferences:com.apple.Users-Groups-Settings.extension", kind: "setting", aliases: ["accounts", "users"] },
  { name: "Terminal", command: "com.apple.Terminal", kind: "tool", aliases: ["shell", "console", "iterm"] },
  { name: "Activity Monitor", command: "com.apple.ActivityMonitor", kind: "tool", aliases: ["cpu", "memory", "tasks"] },
  { name: "Disk Utility", command: "com.apple.DiskUtility", kind: "tool", aliases: ["disk", "format"] },
  { name: "Keychain Access", command: "com.apple.keychainaccess", kind: "tool", aliases: ["passwords", "keychain"] },
  { name: "Console", command: "com.apple.Console", kind: "tool", aliases: ["logs"] },
  { name: "Finder", command: "com.apple.finder", kind: "tool", aliases: ["files", "explorer"] },
];
