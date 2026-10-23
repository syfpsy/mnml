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

/**
 * Cross-platform foreground capture / restore for summon + auto-paste.
 * Windows uses a resident PowerShell Win32 helper, started shortly after boot.
 * It idles in ReadLine (no CPU). A cold start (PowerShell + Add-Type, ~1 s)
 * can't answer the 250 ms capture, so the v0.3.10–v0.3.14 lazy start with a
 * 60 s idle shutdown lost the paste target on most summons.
 */
export class ForegroundService {
  private winHelper: WinForegroundHelper | null = null;
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

  ensureStarted(): void {
    if (IS_WIN) this.ensureWinHelper().ensureStarted();
  }

  shutdown(): void {
    this.cancelCapture();
    this.shutdownWinHelper();
  }

  private shutdownWinHelper(): void {
    this.awaitingRestore = false;
    this.winHelper?.shutdown();
    this.winHelper = null;
  }

  private ensureWinHelper(): WinForegroundHelper {
    if (!this.winHelper) {
      this.winHelper = new WinForegroundHelper((line) => this.handleLine(line));
    }
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
    // A new summon makes any unanswered restore moot; left true, it would swallow every focus reply.
    this.awaitingRestore = false;
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
      void darwinCapture().then((target) => {
        // Same as the Windows "prev" line: ignore results after timeout/cancel.
        if (gen !== this.captureGeneration || !this.captureCallback) return;
        this.onPrevCaptured?.(target);
        this.finishCapture();
      });
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
      this.callbacks.onRestoreMiss();
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
    // An "error: …" reply to a restore is a miss: paste now instead of waiting for the 750 ms timer.
    if (line.startsWith("error") && this.awaitingRestore) {
      this.awaitingRestore = false;
      this.callbacks.onRestoreMiss();
    }
  }

  /** Set by main after construction to store the captured target. */
  onPrevCaptured: ((target: string | null) => void) | null = null;
}
