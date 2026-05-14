import { useEffect, useState } from "react";
import { CompactView } from "./components/compact-view";
import { UpdateBanner, type UpdateState } from "./components/update-banner";
import { bridge } from "./lib/bridge";

export function applyTheme(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  document.documentElement.classList.toggle("dark", !light);
}

export default function App() {
  const [updateState,   setUpdateState]   = useState<UpdateState>("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  // Restore persisted theme before first paint.
  useEffect(() => {
    bridge.getSettings().then((s) => { if (s) applyTheme(s.lightTheme ?? false); });
  }, []);

  // Renderer-side backup focus. Main owns summon focus through executeJavaScript
  // in electron/main.ts; this only covers delayed React remounts.
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let raf: number | null = null;

    const clearScheduledFocus = () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    };

    const focusInput = () => {
      const el = document.querySelector<HTMLInputElement>("input[data-mnml-search='true']");
      if (!el) return;
      el.focus({ preventScroll: true });
      el.select();
    };

    const scheduleFocus = () => {
      clearScheduledFocus();

      const attempt = () => focusInput();

      attempt();
      raf = requestAnimationFrame(attempt);
      for (const delay of [30, 80, 160, 280, 420]) {
        const timer = setTimeout(attempt, delay);
        timers.add(timer);
      }
    };

    const onWindowFocus = () => scheduleFocus();

    const off = bridge.onVisibilityChanged((visible) => {
      clearScheduledFocus();
      window.removeEventListener("focus", onWindowFocus);

      if (visible) {
        scheduleFocus();
        window.addEventListener("focus", onWindowFocus, { once: true });
      }
    });

    return () => {
      off();
      clearScheduledFocus();
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  // Esc always hides.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") bridge.hide(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // Auto-update notifications from the main process.
  useEffect(() => {
    const offAvail = bridge.onUpdateAvailable((v) => {
      setUpdateVersion(v);
      setUpdateState("downloading");
    });
    const offReady = bridge.onUpdateDownloaded((v) => {
      setUpdateVersion(v);
      setUpdateState("ready");
    });
    return () => { offAvail(); offReady(); };
  }, []);

  return (
    <div className="w-full h-full" style={{ background: "var(--bg)" }}>
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ background: "var(--bg)" }}
      >
        <div className="h-full">
          <CompactView onThemeChange={applyTheme} />
        </div>
        <UpdateBanner
          state={updateState}
          version={updateVersion}
          onInstall={() => bridge.installUpdate()}
        />
      </div>
    </div>
  );
}
