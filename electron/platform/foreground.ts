import type { BrowserWindow } from "electron";
import { log } from "../utils/log.js";
import { IS_MAC, IS_WIN } from "./config.js";
import {
  captureForegroundTarget as darwinCapture,
  focusMnmlWindow,
  isOwnForegroundTarget as darwinIsOwn,
  ownForegroundTarget as darwinOwn,
  restoreForegroundTarget as darwinRestore,
} from "./foreground-darwin.js";
import { WinForegroundHelper, windowHandleAsDecimal } from "./foreground-win.js";

export type ForegroundCallbacks = {
  onFocusOk: () => void;
  onFocusMiss: () => void;
  onRestoreOk: () => void;
  onRestoreMiss: () => void;
};

const HELPER_IDLE_MS = 60_000;

/**
 * Cross-platform foreground capture / restore for summon + auto-paste.
 * Windows uses a PowerShell Win32 helper spawned on demand (not at boot).
 */
export class ForegroundService {
  private winHelper: WinForegroundHelper | null = null;
  private helperIdleTimer: NodeJS.Timeout | null = null;
  private captureCallback: (() => void) | null = null;
  private captureTimer: NodeJS.Timeout | null = null;
  private captureGeneration = 0;
  awaitingRestore = false;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private callbacks: ForegroundCallbacks,
  ) {}

  ownTarget(): string | null {
    if (IS_MAC) return darwinOwn();
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return null;
    return windowHandleAsDecimal(win);
  }

  isOwnTarget(target: string): boolean {
    if (IS_MAC) return darwinIsOwn(target);
    const ours = this.ownTarget();
    return !!ours && target === ours;
  }

  sanitizePrevTarget(target: string | null): string | null {
    if (!target || target === "0") return null;
    if (this.isOwnTarget(target)) {
      log("[focus] prev target was mnml — not using for auto-paste restore");
      return null;
    }
    return target;
  }

  /** No-op — helper is lazy-started on first foreground request. */
  ensureStarted(): void { /* lazy */ }

  shutdown(): void {
    this.cancelCapture();
    this.shutdownWinHelper();
  }

  private shutdownWinHelper(): void {
    if (this.helperIdleTimer !== null) {
      clearTimeout(this.helperIdleTimer);
      this.helperIdleTimer = null;
    }
    this.winHelper?.shutdown();
    this.winHelper = null;
  }

  private armHelperIdleShutdown(): void {
    if (this.helperIdleTimer !== null) clearTimeout(this.helperIdleTimer);
    this.helperIdleTimer = setTimeout(() => {
      this.helperIdleTimer = null;
      this.winHelper?.shutdown();
      this.winHelper = null;
    }, HELPER_IDLE_MS);
  }

  private ensureWinHelper(): WinForegroundHelper {
    if (!this.winHelper) {
      this.winHelper = new WinForegroundHelper((line) => this.handleLine(line));
    }
    this.armHelperIdleShutdown();
    return this.winHelper;
  }

  cancelCapture(): void {
    this.captureGeneration += 1;
    if (this.captureTimer !== null) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
    this.captureCallback = null;
  }

  requestCapturePrev(onDone: () => void): void {
    this.cancelCapture();
    const gen = this.captureGeneration;
    this.captureCallback = () => {
      if (gen !== this.captureGeneration) return;
      onDone();
    };
    this.captureTimer = setTimeout(() => {
      this.captureTimer = null;
      log("[focus] capture prev timed out — showing anyway");
      this.finishCapture();
    }, 250);

    if (IS_MAC) {
      const target = darwinCapture();
      if (this.onPrevCaptured) this.onPrevCaptured(target);
      this.finishCapture();
      return;
    }

    const helper = this.ensureWinHelper();
    if (!helper.write("capture\n")) this.finishCapture();
  }

  requestNativeForeground(): void {
    if (IS_MAC) {
      void focusMnmlWindow().then((ok) => {
        if (ok) this.callbacks.onFocusOk();
        else this.callbacks.onFocusMiss();
      });
      return;
    }

    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    const hwnd = windowHandleAsDecimal(win);
    if (!hwnd) return;
    this.ensureWinHelper().write(`focus ${hwnd}\n`);
  }

  requestRestoreForeground(target: string): void {
    if (IS_MAC) {
      this.awaitingRestore = true;
      void darwinRestore(target).then((ok) => {
        this.awaitingRestore = false;
        if (ok) this.callbacks.onRestoreOk();
        else this.callbacks.onRestoreMiss();
      });
      return;
    }

    this.awaitingRestore = true;
    if (!this.ensureWinHelper().write(`restore ${target}\n`)) {
      this.awaitingRestore = false;
    }
  }

  private finishCapture(): void {
    if (this.captureTimer !== null) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
    const cb = this.captureCallback;
    this.captureCallback = null;
    cb?.();
  }

  private handleLine(line: string): void {
    if (!line) return;

    if (line.startsWith("prev ")) {
      if (!this.captureCallback) return;
      const raw = line.slice(5).trim();
      const target = this.sanitizePrevTarget(raw === "0" ? null : raw);
      if (target) this.onPrevCaptured?.(target);
      else this.onPrevCaptured?.(null);
      this.finishCapture();
      return;
    }

    if (line === "restore-ok") {
      if (!this.awaitingRestore) return;
      this.awaitingRestore = false;
      this.callbacks.onRestoreOk();
      return;
    }
    if (line === "restore-miss") {
      if (!this.awaitingRestore) return;
      this.awaitingRestore = false;
      this.callbacks.onRestoreMiss();
      return;
    }
    if (line === "focus-ok") {
      if (this.awaitingRestore) return;
      this.callbacks.onFocusOk();
      return;
    }
    if (line === "focus-miss") {
      if (this.awaitingRestore) return;
      this.callbacks.onFocusMiss();
      return;
    }

    log("[focus] foreground helper:", line);
  }

  /** Set by main after construction to store the captured target. */
  onPrevCaptured: ((target: string | null) => void) | null = null;
}
