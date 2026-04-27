export type UpdateState = "idle" | "downloading" | "ready";

interface Props {
  state: UpdateState;
  version: string | null;
  onInstall: () => void;
}

export function UpdateBanner({ state, version, onInstall }: Props) {
  if (state === "idle") return null;

  const ready = state === "ready";

  return (
    <div
      className="mnml-no-drag absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 text-[11px]"
      style={{
        background:  ready ? "rgba(74,222,128,0.10)" : "rgba(96,165,250,0.10)",
        borderTop:   ready ? "1px solid rgba(74,222,128,0.22)" : "1px solid rgba(96,165,250,0.18)",
        color:       ready ? "#4ade80" : "#60a5fa",
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
          style={{ background: "rgba(74,222,128,0.18)", color: "#4ade80" }}
        >
          Restart now
        </button>
      )}
    </div>
  );
}
