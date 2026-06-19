import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { BrowserWindow } from "electron";
import { log } from "../utils/log.js";

export const WINDOWS_FOREGROUND_HELPER = `
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class MnmlForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  const int SW_SHOW = 5;
  const byte VK_MENU = 0x12;
  const uint KEYEVENTF_KEYUP = 0x0002;

  public static IntPtr CapturePrevious() {
    return GetForegroundWindow();
  }

  public static bool Focus(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return false;

    IntPtr foreground = GetForegroundWindow();
    uint foregroundPid;
    uint targetPid;
    uint foregroundThread = GetWindowThreadProcessId(foreground, out foregroundPid);
    uint targetThread = GetWindowThreadProcessId(hWnd, out targetPid);
    uint currentThread = GetCurrentThreadId();

    bool attachedForeground = false;
    bool attachedTarget = false;

    try {
      if (foregroundThread != 0 && foregroundThread != currentThread) {
        attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
      }
      if (targetThread != 0 && targetThread != currentThread) {
        attachedTarget = AttachThreadInput(currentThread, targetThread, true);
      }

      keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
      keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

      ShowWindowAsync(hWnd, SW_SHOW);
      BringWindowToTop(hWnd);
      SetForegroundWindow(hWnd);
      SwitchToThisWindow(hWnd, true);
      SetFocus(hWnd);
      return GetForegroundWindow() == hWnd;
    } finally {
      if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
      if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
    }
  }

  public static bool Restore(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return false;

    keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

    ShowWindowAsync(hWnd, SW_SHOW);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    SwitchToThisWindow(hWnd, true);
    return GetForegroundWindow() == hWnd;
  }
}
"@

while (($line = [Console]::In.ReadLine()) -ne $null) {
  $line = $line.Trim()
  if ($line -eq "exit") { break }
  try {
    if ($line -eq "capture") {
      $prev = [MnmlForeground]::CapturePrevious()
      [Console]::Out.WriteLine("prev " + $prev.ToInt64())
    } elseif ($line.StartsWith("restore ")) {
      $hwnd = [IntPtr]([Int64]($line.Substring(8)))
      $ok = [MnmlForeground]::Restore($hwnd)
      [Console]::Out.WriteLine($(if ($ok) { "restore-ok" } else { "restore-miss" }))
    } elseif ($line.StartsWith("focus ")) {
      $hwnd = [IntPtr]([Int64]($line.Substring(6).Trim()))
      $ok = [MnmlForeground]::Focus($hwnd)
      [Console]::Out.WriteLine($(if ($ok) { "focus-ok" } else { "focus-miss" }))
    } else {
      [Console]::Out.WriteLine("error: unknown command")
    }
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine("error: " + $_.Exception.Message)
    [Console]::Out.Flush()
  }
}
`;

export function windowHandleAsDecimal(w: BrowserWindow): string | null {
  const handle = w.getNativeWindowHandle();
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString();
  if (handle.length >= 4) return BigInt(handle.readUInt32LE(0)).toString();
  return null;
}

export type ForegroundLineHandler = (line: string) => void;

export class WinForegroundHelper {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";

  constructor(private onLine: ForegroundLineHandler) {}

  ensureStarted(): void {
    if (this.child && !this.child.killed) return;

    const encoded = Buffer.from(WINDOWS_FOREGROUND_HELPER, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );

    child.stdout.setEncoding("utf8");
    const HELPER_BUFFER_CAP = 16 * 1024;
    child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > HELPER_BUFFER_CAP) {
        log("[focus] foreground helper buffer overflow; truncating");
        this.buffer = this.buffer.slice(-1024);
      }
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() ?? "";
      for (const line of lines) this.onLine(line.trim());
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const msg = chunk.trim();
      if (msg && !msg.startsWith("#< CLIXML")) log("[focus] foreground helper stderr:", msg);
    });
    child.on("exit", (code) => {
      this.child = null;
      this.buffer = "";
      if (code !== 0 && code !== null) log("[focus] foreground helper exited:", code);
    });
    child.on("error", (err) => {
      this.child = null;
      log("[focus] foreground helper failed:", String(err));
    });

    this.child = child;
  }

  write(cmd: string): boolean {
    this.ensureStarted();
    if (!this.child || this.child.stdin.destroyed) return false;
    try {
      this.child.stdin.write(cmd);
      return true;
    } catch (err) {
      log("[focus] foreground request failed:", String(err));
      return false;
    }
  }

  shutdown(): void {
    try { this.child?.stdin.write("exit\n"); } catch { /* noop */ }
    try { this.child?.kill(); } catch { /* noop */ }
    this.child = null;
    this.buffer = "";
  }
}
