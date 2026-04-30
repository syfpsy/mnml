import { useEffect, useState } from "react";
import { Switch } from "@heroui/react/switch";
import { NumberField } from "@heroui/react/number-field";
import { bridge } from "../lib/bridge";
import { useSettings } from "../hooks/use-settings";
import { XIcon } from "./icons";

interface Props {
  onClose: () => void;
  onThemeChange: (light: boolean) => void;
}

export function SettingsPanel({ onClose, onThemeChange }: Props) {
  const { settings, update } = useSettings();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Stop the event from reaching app.tsx's global Escape→hide handler.
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    /* Scrim */
    <div
      className="absolute inset-0 z-20 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      {/* Dismiss on scrim click */}
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-[360px] rounded-xl p-5 shadow-xl"
        style={{
          background:  "var(--bg-raised)",
          boxShadow:   "0 0 0 1px var(--border), 0 24px 48px rgba(0,0,0,0.4)",
        }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-[13px] font-medium" style={{ color: "var(--t1)" }}>Settings</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ color: "var(--t2)" }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "var(--t1)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--t2)"}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {!settings ? (
          <p className="text-[12px] py-4 text-center" style={{ color: "var(--t3)" }}>Loading…</p>
        ) : (
          <div className="flex flex-col gap-5">

            <Row label="Monitor clipboard" hint="Capture text, links and images as you copy.">
              <Toggle isSelected={settings.monitoring}    onChange={(v) => update("monitoring", v)}    label="Monitor clipboard" />
            </Row>

            <Row label="Launch on startup" hint="Start with Windows so the hotkey always works.">
              <Toggle isSelected={settings.launchOnStartup} onChange={(v) => update("launchOnStartup", v)} label="Launch on startup" />
            </Row>

            <Row label="Auto-paste on restore" hint="Simulates Ctrl+V so the item lands in the focused app.">
              <Toggle isSelected={settings.autoPaste}    onChange={(v) => update("autoPaste", v)}    label="Auto-paste on restore" />
            </Row>

            <Row label="Light theme" hint="Switch to a light colour scheme.">
              <Toggle
                isSelected={settings.lightTheme}
                onChange={async (v) => { await update("lightTheme", v); onThemeChange(v); }}
                label="Light theme"
              />
            </Row>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <Row label="Max saved items" hint="Older items are pruned above the limit.">
                <NumberField.Root
                  value={settings.maxItems}
                  minValue={20}
                  maxValue={5000}
                  step={10}
                  onChange={(v) => update("maxItems", Math.round(v))}
                  className="w-24"
                >
                  <NumberField.Input aria-label="Max saved items" />
                </NumberField.Root>
              </Row>
            </div>

            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                type="button"
                onClick={async () => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    setTimeout(() => setConfirmClear(false), 3500);
                    return;
                  }
                  await bridge.clear();
                  setConfirmClear(false);
                }}
                className="text-[12px] px-3 py-1.5 rounded-md transition-colors"
                style={{
                  color:      confirmClear ? "#ef4444" : "var(--t2)",
                  background: confirmClear ? "rgba(239,68,68,0.08)" : "transparent",
                }}
              >
                {confirmClear ? "Click again to confirm" : "Clear history"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="text-[12px] px-3 py-1.5 rounded-md font-medium transition-colors"
                style={{ background: "var(--item-active)", color: "var(--t1)" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.opacity = "0.8"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.opacity = "1"}
              >
                Done
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function Toggle({ isSelected, onChange, label }: {
  isSelected: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch.Root isSelected={isSelected} onChange={onChange} aria-label={label}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch.Root>
  );
}

function Row({ label, hint, children }: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="text-[13px] leading-tight" style={{ color: "var(--t1)" }}>{label}</div>
        <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--t2)" }}>{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
