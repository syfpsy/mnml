import { useEffect, useState } from "react";
import { CompactView } from "./components/compact-view";
import { ExpandedView } from "./components/expanded-view";
import { UpdateBanner, type UpdateState } from "./components/update-banner";
import { bridge } from "./lib/bridge";

type Mode = "compact" | "expanded";

const LS_KEY = "mnml:windowMode";

function readSavedMode(): Mode {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "compact" || v === "expanded") return v;
  } catch { /* ignore */ }
  return "compact";
}

export function applyTheme(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  document.documentElement.classList.toggle("dark", !light);
}

export default function App() {
  const [mode, setMode] = useState<Mode>(readSavedMode);
  const [updateState,   setUpdateState]   = useState<UpdateState>("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  // Restore persisted theme before first paint.
  useEffect(() => {
    bridge.getSettings().then((s) => { if (s) applyTheme(s.lightTheme ?? false); });
  }, []);

  // Keep main-process window size in sync.
  useEffect(() => {
    bridge.setMode(mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the search input whenever the window becomes visible.
  //
  // Two-pronged strategy to cover every Windows timing scenario:
  //
  // 1. 80 ms timer  — fast path. Handles the common case where
  //    app.focus({ steal: true }) + win.focus() in the main process already
  //    transferred OS focus to Electron by the time the timer fires.
  //
  // 2. window "focus" event — slow path. Fires the moment the OS actually
  //    hands focus to the Electron window. Catches cases where Windows delays
  //    the grant (e.g. focus-steal prevention kicking in despite the steal
  //    flag, or the 50 ms retry in main not yet having fired).
  //
  // Both paths are cleaned up when the window hides again so they don't
  // linger and fire on unrelated future focus events.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const focusInput = () => {
      const el = document.querySelector<HTMLInputElement>("input[aria-label='Search clipboard']");
      el?.focus();
      el?.select();
    };

    const onWindowFocus = () => focusInput();

    const off = bridge.onVisibilityChanged((visible) => {
      // Cancel any pending work from a previous show cycle.
      if (timer !== null) { clearTimeout(timer); timer = null; }
      window.removeEventListener("focus", onWindowFocus);

      if (visible) {
        timer = setTimeout(focusInput, 80);
        // { once } so this auto-removes after the first fire and doesn't
        // re-focus on every subsequent alt-tab while the window is open.
        window.addEventListener("focus", onWindowFocus, { once: true });
      }
    });

    return () => {
      off();
      if (timer !== null) clearTimeout(timer);
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

  const switchMode = (next: Mode) => {
    setMode(next);
    bridge.setMode(next);
    try { localStorage.setItem(LS_KEY, next); } catch { /* ignore */ }
  };

  return (
    /* 4 px gap all around so the rounded corners are visible against the desktop */
    <div className="w-full h-full p-1">
      <div
        className="relative w-full h-full rounded-[10px] overflow-hidden"
        style={{ background: "var(--bg)", boxShadow: "0 0 0 1px var(--border)" }}
      >
        <div className="h-full">
          {mode === "compact" ? (
            <CompactView onExpand={() => switchMode("expanded")} onThemeChange={applyTheme} />
          ) : (
            <ExpandedView
              onCollapse={() => switchMode("compact")}
              onThemeChange={applyTheme}
            />
          )}
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
