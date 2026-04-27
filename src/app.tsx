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

  // Focus search when window becomes visible.
  useEffect(() => {
    const off = bridge.onVisibilityChanged((visible) => {
      if (visible) {
        const el = document.querySelector<HTMLInputElement>("input[aria-label='Search clipboard']");
        el?.focus();
        el?.select();
      }
    });
    return off;
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
