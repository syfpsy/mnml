export type UpdateState = "idle" | "downloading" | "ready";

interface Props {
  state: UpdateState;
  version: string | null;
  onInstall: () => void;
}

/**
 * UpdateBanner — appears along the bottom edge while an update is downloading
 * and after one is ready to install. Colours come from the themed
 * `--accent-info` / `--accent-success` token families so the banner looks
 * right in both dark and light themes.
 */
export function UpdateBanner({ state, version, onInstall }: Props) {
  if (state === "idle") return null;

  const ready = state === "ready";
  const fg     = ready ? "var(--accent-success)"        : "var(--accent-info)";
  const bg     = ready ? "var(--accent-success-bg)"     : "var(--accent-info-bg)";
  const border = ready ? "var(--accent-success-border)" : "var(--accent-info-border)";

  // No `absolute` positioning anymore — the banner is a regular flex child
  // inside CompactView's outer column, slotted above the footer. When
  // `state === "idle"` it returns null and consumes no flex height. When
  // active it pushes the content area up by its own row height (a few
  // pixels) so the banner and footer never overlap. `mnml-no-drag` keeps
  // the row click-through (the parent header has `mnml-drag` set).
  return (
    <div
      className="mnml-no-drag flex items-center justify-between px-3 py-1.5 text-[11px]"
      style={{
        background: bg,
        borderTop:  `1px solid ${border}`,
        color:      fg,
      }}
    >
      <span>
        {ready
          ? `v${version} ready to install`
          : `Downloading v${version}…`}
      </span>
      {ready && (
        <button
          type="button"
          onClick={onInstall}
          className="px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-75 active:opacity-60"
          style={{ background: "var(--accent-success-btn)", color: "var(--accent-success)" }}
        >
          Restart now
        </button>
      )}
    </div>
  );
}
