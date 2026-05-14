import { useEffect, useRef, useState } from "react";
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
  const [version, setVersion] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Move focus into the sheet on open. Pairs with the `inert` attribute on
  // <CompactView>'s non-modal subtree (set in compact-view.tsx) — together
  // they form a proper modal: focus enters the dialog, can't escape until
  // close, and the rest of the window is silenced for assistive tech.
  useEffect(() => {
    closeBtnRef.current?.focus({ preventScroll: true });
    // Cheap: one IPC call on open. Not subscribed; version only changes on
    // app restart, and the sheet is short-lived enough that re-reading on
    // each open is the simpler model.
    bridge.getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

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
    /* Scrim — themed via `--scrim` token (was hardcoded `rgba(0,0,0,0.5)`,
       which looked harsh in light mode). */
    <div
      className="absolute inset-0 z-20 flex items-center justify-center"
      style={{ background: "var(--scrim)" }}
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
        role="dialog"
        aria-labelledby="settings-title"
        aria-modal="true"
        className="relative w-[420px] max-h-[calc(100%-32px)] overflow-y-auto mnml-scroll rounded-xl p-5"
        style={{
          background:  "var(--bg-raised)",
          boxShadow:   "0 0 0 1px var(--border), var(--elevation-2)",
        }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <h2
            id="settings-title"
            className="text-[13px] font-medium m-0"
            style={{ color: "var(--t1)" }}
          >
            Settings
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="mnml-btn-ghost p-1.5 rounded-md transition-colors"
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
                <NumberInput
                  value={settings.maxItems}
                  min={20}
                  max={5000}
                  step={10}
                  onChange={(v) => update("maxItems", v)}
                  label="Max saved items"
                />
              </Row>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <StorageSection />
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <Row label="Updates" hint="Auto-check daily. Click to check now.">
                <CheckUpdateBtn />
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
                  color:      confirmClear ? "var(--accent-danger)"    : "var(--t2)",
                  background: confirmClear ? "var(--accent-danger-bg)" : "transparent",
                }}
              >
                {confirmClear ? "Click again to confirm" : "Clear history"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="text-[12px] px-3 py-1.5 rounded-md font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--item-active)", color: "var(--t1)" }}
              >
                Done
              </button>
            </div>

            {/* About footer — version + support contact. Kept tiny so it
                reads as metadata, not as a row. */}
            <div
              className="flex items-center justify-between text-[10px] pt-3"
              style={{ color: "var(--t3)" }}
            >
              <span className="tabular-nums">
                mnml {version ? `v${version}` : ""}
              </span>
              <a
                href="mailto:info@nxyz.art"
                className="hover:opacity-80"
                style={{ color: "var(--t2)" }}
              >
                info@nxyz.art
              </a>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

/**
 * Toggle — plain button + `role="switch"`. Replaces HeroUI's `Switch.Root`
 * to drop the entire `@heroui/react` dependency. ~40 lines vs. a multi-MB
 * library; identical to the user.
 *
 * Sizing: 40 × 24 track, 20 × 20 thumb, 2 px padding. 24 px height meets
 * WCAG 2.5.8 (Target Size — Minimum) which the previous 18 px height failed.
 *
 * Animation: thumb position is driven by `transform: translateX()`, not
 * `left`. Transform is composited and doesn't trigger reflow; animating
 * `left` was a layout-property animation the design laws prohibit.
 */
function Toggle({ isSelected, onChange, label }: {
  isSelected: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isSelected}
      aria-label={label}
      onClick={() => onChange(!isSelected)}
      className="relative inline-flex items-center w-10 h-6 rounded-full transition-colors"
      style={{
        background: isSelected ? "var(--accent-app)" : "var(--item-active)",
      }}
    >
      <span
        aria-hidden
        className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full"
        style={{
          // The thumb wants the inverse of the track colour. Use `--bg`
          // (themed) instead of the literal dark hex so the thumb looks
          // right in both themes.
          background: isSelected ? "var(--bg)" : "var(--t2)",
          transform: isSelected ? "translateX(16px)" : "translateX(0)",
          transition:
            "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease",
        }}
      />
    </button>
  );
}

/**
 * NumberInput — plain `<input type="number">`. Stays uncontrolled visually
 * (the input shows whatever you type) but clamps on commit.
 */
function NumberInput({ value, min, max, step, onChange, label }: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    const clamped = Math.max(min, Math.min(max, Math.round(n)));
    if (clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <input
      type="number"
      aria-label={label}
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } }}
      className="mnml-numinput w-24 text-[13px] px-2 py-1 rounded-md tabular-nums"
      style={{
        background:  "var(--bg)",
        color:       "var(--t1)",
        boxShadow:   "0 0 0 1px var(--border)",
      }}
    />
  );
}

/**
 * CheckUpdateBtn — kicks `autoUpdater.checkForUpdates()` on demand. The real
 * "update ready" flow still goes through `UpdateBanner`; this button just
 * makes the check explicit + gives the user feedback when there's nothing
 * new (the banner only fires on a positive result).
 */
function CheckUpdateBtn() {
  const [state, setState] = useState<"idle" | "checking" | "current" | "available" | "error">("idle");
  const [msg,   setMsg]   = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const onClick = async () => {
    setState("checking"); setMsg(null);
    const r = await bridge.checkUpdate();
    if (!r.ok) {
      setState("error");
      setMsg(r.message ?? "Failed to check");
    } else if (r.available && r.version) {
      setState("available");
      setMsg(`v${r.version} downloading…`);
    } else {
      setState("current");
      setMsg("Up to date");
    }
    // Reset the transient label after a moment so the button is reusable.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setState("idle"); setMsg(null); }, 4000);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "checking"}
      className="text-[12px] px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
      style={{
        background: state === "available" ? "var(--accent-app-bg)" :
                    state === "error"     ? "var(--accent-danger-bg)" :
                    "var(--item-active)",
        color:      state === "available" ? "var(--accent-app)" :
                    state === "error"     ? "var(--accent-danger)" :
                    "var(--t1)",
      }}
      title={msg ?? undefined}
    >
      {state === "checking"  ? "Checking…" :
       state === "current"   ? "Up to date" :
       state === "available" ? "Update ready" :
       state === "error"     ? "Check failed" :
       "Check now"}
    </button>
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

/**
 * StorageSection — full-width "Storage folder" row.
 *
 * Doesn't use <Row> because the path display wants to span the full sheet
 * width (paths get long). Three controls: Choose folder, Reset to default
 * (only when not on default), Reveal in Explorer.
 *
 * Migration flow:
 *   - Click "Choose folder..." → native dialog (main process)
 *   - On confirm → bridge.storageSet → main copies data + restarts app
 *   - The renderer sees a brief "Migrating..." state until the app dies.
 */
function StorageSection() {
  const [state, setState] = useState<{ dataDir: string; defaultDir: string; isDefault: boolean } | null>(null);
  const [busy,  setBusy]  = useState<"idle" | "picking" | "migrating">("idle");
  const [msg,   setMsg]   = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bridge.storageGet().then(setState).catch(() => setState(null));
    return () => { if (msgTimer.current) clearTimeout(msgTimer.current); };
  }, []);

  const flash = (kind: "ok" | "err", text: string, lingerMs = 4000) => {
    setMsg({ kind, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), lingerMs);
  };

  const choose = async () => {
    if (busy !== "idle") return;
    setBusy("picking");
    try {
      const picked = await bridge.storagePick();
      if (!picked) { setBusy("idle"); return; }
      setBusy("migrating");
      const r = await bridge.storageSet(picked);
      if (!r.ok) {
        flash("err", r.message);
        setBusy("idle");
        return;
      }
      // Success — main process restarts the app within ~600 ms. Show a
      // confirmation in case the restart is delayed.
      flash("ok", r.message, 8000);
    } catch (err) {
      flash("err", String((err as Error)?.message ?? err));
      setBusy("idle");
    }
  };

  const reset = async () => {
    if (busy !== "idle") return;
    setBusy("migrating");
    const r = await bridge.storageReset();
    if (!r.ok) {
      flash("err", r.message);
      setBusy("idle");
      return;
    }
    flash("ok", r.message, 8000);
  };

  const reveal = () => { void bridge.storageReveal(); };

  if (!state) {
    return (
      <p className="text-[12px]" style={{ color: "var(--t3)" }}>Loading storage info…</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-[13px] leading-tight" style={{ color: "var(--t1)" }}>Storage folder</div>
        <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--t2)" }}>
          Where mnml saves clipboard history, snippets, and images. Point this at a Dropbox / OneDrive / iCloud folder to sync across devices. Don't run two devices on the same synced folder at the same time.
        </div>
      </div>

      <button
        type="button"
        onClick={reveal}
        title="Open this folder in Explorer"
        className="text-left text-[11px] font-mono px-2 py-1.5 rounded truncate transition-colors hover:opacity-90"
        style={{
          background:  "var(--bg)",
          color:       "var(--t1)",
          boxShadow:   "0 0 0 1px var(--border)",
          fontFamily:  "ui-monospace, 'Cascadia Code', Consolas, monospace",
        }}
      >
        {state.dataDir}
      </button>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={choose}
          disabled={busy !== "idle"}
          className="text-[12px] px-3 py-1.5 rounded-md font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--accent-saved-bg)", color: "var(--accent-saved-text)" }}
        >
          {busy === "picking"    ? "Choosing…" :
           busy === "migrating"  ? "Migrating…" :
           "Choose folder…"}
        </button>

        {!state.isDefault && (
          <button
            type="button"
            onClick={reset}
            disabled={busy !== "idle"}
            className="mnml-btn-ghost text-[12px] px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset to default
          </button>
        )}
      </div>

      {msg && (
        <p
          className="text-[11px] leading-snug mt-1"
          style={{ color: msg.kind === "ok" ? "var(--accent-success)" : "var(--accent-danger)" }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
