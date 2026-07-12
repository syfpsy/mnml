import { useEffect, useState } from "react";
import { CompactView } from "./components/compact-view";
import { type UpdateState } from "./components/update-banner";
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

  // Renderer-side backup focus — main owns summon focus via executeJavaScript.
  // Single delayed attempt only if the search field still isn't focused.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearScheduledFocus = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const focusInput = () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (document.querySelector("[data-mnml-snippet-form]")) return;
      const el = document.querySelector<HTMLInputElement>("input[data-mnml-search='true']");
      if (!el) return;
      if (document.activeElement === el && document.hasFocus()) return;
      el.focus({ preventScroll: true });
      el.select();
    };

    const off = bridge.onVisibilityChanged((visible) => {
      clearScheduledFocus();
      if (visible) {
        timer = setTimeout(focusInput, 120);
      }
    });

    return () => {
      off();
      clearScheduledFocus();
    };
  }, []);

  // Esc hides — unless a modal sheet, snippet form, or the search field is active.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement) return;
      if (active?.closest("[data-mnml-snippet-form]")) return;
      // Search bar owns Escape while focused (clear query, then hide).
      if (active instanceof HTMLInputElement && active.dataset.mnmlSearch === "true") return;
      bridge.hide();
    };
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
        <CompactView
          onThemeChange={applyTheme}
          updateState={updateState}
          updateVersion={updateVersion}
          onInstallUpdate={() => bridge.installUpdate()}
        />
      </div>
    </div>
  );
}
