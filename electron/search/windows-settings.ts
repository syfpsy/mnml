/**
 * windows-settings.ts — curated list of Windows Settings deep-links and
 * classic system tools that appear alongside Start-Menu apps in the
 * launcher.
 *
 * These are static — there's no enumeration API for ms-settings: URIs that
 * works reliably across Windows versions, so we ship a hand-picked list
 * of the most-asked-for entries. Contributions welcome; the bar is "useful
 * enough that someone will type its name into a launcher".
 *
 * Launching:
 *   - `ms-settings:` URIs are handled by the OS — `shell.openExternal()`.
 *   - `.exe`, `.msc`, `.cpl`, `.ms` paths → `shell.openPath()`.
 *
 * Each entry carries optional aliases so partial / colloquial matches
 * still resolve (e.g. "wifi" for "Wi-Fi").
 */

export interface SystemShortcut {
  /** Display name in the result list. */
  name:    string;
  /** Either an `ms-settings:` URI or a plain command name (resolved via PATH). */
  command: string;
  /** "setting" → ms-settings: page; "tool" → classic Win32 utility. */
  kind:    "setting" | "tool";
  /** Extra strings to match against during search. Already lowercased OK. */
  aliases?: string[];
}

export const WINDOWS_SHORTCUTS: SystemShortcut[] = [
  // ── Settings home + popular pages ─────────────────────────────────────────
  { name: "Settings",                  command: "ms-settings:",                          kind: "setting", aliases: ["windows settings"] },
  { name: "System",                    command: "ms-settings:system",                    kind: "setting" },
  { name: "Display",                   command: "ms-settings:display",                   kind: "setting", aliases: ["screen", "monitor", "resolution"] },
  { name: "Sound",                     command: "ms-settings:sound",                     kind: "setting", aliases: ["audio", "speaker", "microphone"] },
  { name: "Notifications",             command: "ms-settings:notifications",             kind: "setting" },
  { name: "Focus / Do Not Disturb",    command: "ms-settings:quiethours",                kind: "setting", aliases: ["dnd", "focus assist"] },
  { name: "Power & Sleep",             command: "ms-settings:powersleep",                kind: "setting", aliases: ["battery"] },
  { name: "Battery",                   command: "ms-settings:batterysaver",              kind: "setting" },
  { name: "Storage",                   command: "ms-settings:storage",                   kind: "setting", aliases: ["disk space"] },
  { name: "Multitasking",              command: "ms-settings:multitasking",              kind: "setting", aliases: ["snap"] },
  { name: "About",                     command: "ms-settings:about",                     kind: "setting", aliases: ["system info", "device specs"] },
  { name: "Night Light",               command: "ms-settings:nightlight",                kind: "setting", aliases: ["blue light"] },

  // ── Network ───────────────────────────────────────────────────────────────
  { name: "Network & Internet",        command: "ms-settings:network",                   kind: "setting", aliases: ["internet"] },
  { name: "Wi-Fi",                     command: "ms-settings:network-wifi",              kind: "setting", aliases: ["wifi", "wireless"] },
  { name: "Ethernet",                  command: "ms-settings:network-ethernet",          kind: "setting", aliases: ["lan", "wired"] },
  { name: "VPN",                       command: "ms-settings:network-vpn",               kind: "setting" },
  { name: "Mobile Hotspot",            command: "ms-settings:network-mobilehotspot",     kind: "setting", aliases: ["hotspot", "tethering"] },
  { name: "Proxy",                     command: "ms-settings:network-proxy",             kind: "setting" },

  // ── Bluetooth & devices ───────────────────────────────────────────────────
  { name: "Bluetooth & Devices",       command: "ms-settings:bluetooth",                 kind: "setting", aliases: ["bt", "devices"] },
  { name: "Printers & Scanners",       command: "ms-settings:printers",                  kind: "setting", aliases: ["printer"] },
  { name: "Mouse",                     command: "ms-settings:mousetouchpad",             kind: "setting", aliases: ["pointer", "trackpad"] },
  { name: "Keyboard",                  command: "ms-settings:keyboard",                  kind: "setting" },
  { name: "Pen & Windows Ink",         command: "ms-settings:pen",                       kind: "setting", aliases: ["stylus"] },
  { name: "AutoPlay",                  command: "ms-settings:autoplay",                  kind: "setting" },

  // ── Personalisation ───────────────────────────────────────────────────────
  { name: "Personalization",           command: "ms-settings:personalization",           kind: "setting", aliases: ["theme", "appearance"] },
  { name: "Background",                command: "ms-settings:personalization-background",kind: "setting", aliases: ["wallpaper", "desktop background"] },
  { name: "Colors",                    command: "ms-settings:personalization-colors",    kind: "setting", aliases: ["accent color", "dark mode"] },
  { name: "Lock Screen",               command: "ms-settings:lockscreen",                kind: "setting" },
  { name: "Themes",                    command: "ms-settings:themes",                    kind: "setting" },
  { name: "Fonts",                     command: "ms-settings:fonts",                     kind: "setting", aliases: ["typography"] },
  { name: "Start",                     command: "ms-settings:personalization-start",     kind: "setting", aliases: ["start menu"] },
  { name: "Taskbar",                   command: "ms-settings:taskbar",                   kind: "setting" },

  // ── Apps ──────────────────────────────────────────────────────────────────
  { name: "Apps & Features",           command: "ms-settings:appsfeatures",              kind: "setting", aliases: ["uninstall", "installed apps"] },
  { name: "Default Apps",              command: "ms-settings:defaultapps",               kind: "setting", aliases: ["default browser"] },
  { name: "Optional Features",         command: "ms-settings:optionalfeatures",          kind: "setting" },
  { name: "Startup Apps",              command: "ms-settings:startupapps",               kind: "setting", aliases: ["autostart"] },

  // ── Accounts ──────────────────────────────────────────────────────────────
  { name: "Your Info",                 command: "ms-settings:yourinfo",                  kind: "setting", aliases: ["profile picture", "account"] },
  { name: "Sign-in Options",           command: "ms-settings:signinoptions",             kind: "setting", aliases: ["pin", "password", "fingerprint", "windows hello"] },
  { name: "Email & Accounts",          command: "ms-settings:emailandaccounts",          kind: "setting" },
  { name: "Family & Other Users",      command: "ms-settings:otherusers",                kind: "setting", aliases: ["add user"] },
  { name: "Windows Backup",            command: "ms-settings:backup",                    kind: "setting" },

  // ── Time & language ───────────────────────────────────────────────────────
  { name: "Date & Time",               command: "ms-settings:dateandtime",               kind: "setting", aliases: ["clock", "timezone"] },
  { name: "Language",                  command: "ms-settings:regionlanguage",            kind: "setting", aliases: ["locale", "region"] },
  { name: "Typing",                    command: "ms-settings:typing",                    kind: "setting", aliases: ["autocorrect"] },

  // ── Gaming ────────────────────────────────────────────────────────────────
  { name: "Game Bar",                  command: "ms-settings:gaming-gamebar",            kind: "setting" },
  { name: "Captures",                  command: "ms-settings:gaming-gamedvr",            kind: "setting", aliases: ["screen recording"] },
  { name: "Game Mode",                 command: "ms-settings:gaming-gamemode",           kind: "setting" },

  // ── Accessibility ─────────────────────────────────────────────────────────
  { name: "Accessibility",             command: "ms-settings:easeofaccess",              kind: "setting", aliases: ["ease of access", "a11y"] },
  { name: "Magnifier",                 command: "ms-settings:easeofaccess-magnifier",    kind: "setting" },
  { name: "Narrator",                  command: "ms-settings:easeofaccess-narrator",     kind: "setting", aliases: ["screen reader"] },
  { name: "High Contrast",             command: "ms-settings:easeofaccess-highcontrast", kind: "setting" },

  // ── Privacy & security ────────────────────────────────────────────────────
  { name: "Privacy",                   command: "ms-settings:privacy",                   kind: "setting" },
  { name: "Camera Privacy",            command: "ms-settings:privacy-webcam",            kind: "setting", aliases: ["webcam"] },
  { name: "Microphone Privacy",        command: "ms-settings:privacy-microphone",        kind: "setting" },
  { name: "Location Privacy",          command: "ms-settings:privacy-location",          kind: "setting", aliases: ["gps"] },
  { name: "Windows Security",          command: "ms-settings:windowsdefender",           kind: "setting", aliases: ["defender", "antivirus", "firewall"] },
  { name: "Find My Device",            command: "ms-settings:findmydevice",              kind: "setting" },

  // ── Updates & recovery ────────────────────────────────────────────────────
  { name: "Windows Update",            command: "ms-settings:windowsupdate",             kind: "setting", aliases: ["update"] },
  { name: "Recovery",                  command: "ms-settings:recovery",                  kind: "setting", aliases: ["reset pc", "reinstall"] },
  { name: "Activation",                command: "ms-settings:activation",                kind: "setting", aliases: ["license", "product key"] },
  { name: "Troubleshoot",              command: "ms-settings:troubleshoot",              kind: "setting" },

  // ── Classic system tools ──────────────────────────────────────────────────
  { name: "Task Manager",              command: "taskmgr",                               kind: "tool",   aliases: ["processes", "performance"] },
  { name: "Device Manager",            command: "devmgmt.msc",                           kind: "tool",   aliases: ["drivers"] },
  { name: "Disk Management",           command: "diskmgmt.msc",                          kind: "tool",   aliases: ["partitions", "format"] },
  { name: "Computer Management",       command: "compmgmt.msc",                          kind: "tool" },
  { name: "Services",                  command: "services.msc",                          kind: "tool" },
  { name: "Event Viewer",              command: "eventvwr.msc",                          kind: "tool",   aliases: ["logs"] },
  { name: "Group Policy Editor",       command: "gpedit.msc",                            kind: "tool",   aliases: ["gpedit"] },
  { name: "Local Users and Groups",    command: "lusrmgr.msc",                           kind: "tool",   aliases: ["users"] },
  { name: "Performance Monitor",       command: "perfmon.msc",                           kind: "tool",   aliases: ["perfmon"] },
  { name: "Resource Monitor",          command: "resmon",                                kind: "tool",   aliases: ["resmon"] },
  { name: "System Properties",         command: "sysdm.cpl",                             kind: "tool",   aliases: ["env vars", "environment variables"] },
  { name: "System Information",        command: "msinfo32",                              kind: "tool",   aliases: ["msinfo"] },
  { name: "Registry Editor",           command: "regedit",                               kind: "tool",   aliases: ["regedit"] },
  { name: "DirectX Diagnostic",        command: "dxdiag",                                kind: "tool",   aliases: ["dxdiag", "directx"] },
  { name: "Control Panel",             command: "control",                               kind: "tool" },
  { name: "Programs and Features",     command: "appwiz.cpl",                            kind: "tool",   aliases: ["uninstall programs"] },
  { name: "Network Connections",       command: "ncpa.cpl",                              kind: "tool",   aliases: ["adapters", "ipconfig"] },
  { name: "Power Options",             command: "powercfg.cpl",                          kind: "tool" },
  { name: "Date and Time (legacy)",    command: "timedate.cpl",                          kind: "tool" },
  { name: "Internet Properties",       command: "inetcpl.cpl",                           kind: "tool" },
  { name: "Windows Features",          command: "optionalfeatures",                      kind: "tool" },
  { name: "Snipping Tool",             command: "snippingtool",                          kind: "tool",   aliases: ["screenshot"] },
  { name: "Calculator",                command: "calc",                                  kind: "tool" },
  { name: "Command Prompt",            command: "cmd",                                   kind: "tool",   aliases: ["cmd", "shell", "terminal"] },
  { name: "PowerShell",                command: "powershell",                            kind: "tool",   aliases: ["pwsh", "shell", "terminal"] },
  { name: "File Explorer",             command: "explorer",                              kind: "tool",   aliases: ["files", "explorer"] },
];
