import { SearchIcon, XIcon } from "./icons";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onArrowDown?: () => void;
  onArrowUp?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
  onEnter?: (e: React.KeyboardEvent) => void;
  onEscape?: () => void;
  /** Called when Delete is pressed while the input is empty. */
  onDelete?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SearchBar({
  value,
  onChange,
  onArrowDown,
  onArrowUp,
  onHome,
  onEnd,
  onEnter,
  onEscape,
  onDelete,
  placeholder = "Search...",
  ariaLabel = "Search clipboard",
  autoFocus = false,
  inputRef,
}: Props) {
  return (
    <div
      data-mnml-search-bar="true"
      className="mnml-no-drag flex items-center gap-2 h-9 px-3 rounded-lg transition-shadow"
      style={{
        background: "var(--bg-raised)",
        boxShadow: "0 0 0 1px var(--border)",
      }}
      // 1px light-blue ring via `--focus-search` on the wrapper when any
      // child (input, clear-x) gains keyboard or pointer focus. The wrapper
      // owns the focus signal; child inputs + buttons opt out of the
      // generic 2px outline (scoped by `[data-mnml-search-bar]` in
      // styles.css) so the two indicators don't stack.
      onFocusCapture={(e) => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--focus-search)")}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          e.currentTarget.style.boxShadow = "0 0 0 1px var(--border)";
        }
      }}
    >
      <SearchIcon className="w-[14px] h-[14px] shrink-0" style={{ color: "var(--t3)" }} />

      <input
        ref={inputRef}
        aria-label={ariaLabel}
        data-mnml-search="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
        style={{ color: "var(--t1)" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); onArrowDown?.(); }
          else if (e.key === "ArrowUp") { e.preventDefault(); onArrowUp?.(); }
          else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); onHome?.(); }
          else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); onEnd?.(); }
          else if (e.key === "Enter") { e.preventDefault(); onEnter?.(e); }
          else if (e.key === "Delete" && !value) { e.preventDefault(); onDelete?.(); }
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (value) onChange("");
            else onEscape?.();
          }
        }}
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className="mnml-btn-ghost shrink-0 p-1 -m-1 rounded"
        >
          <XIcon className="w-[14px] h-[14px]" />
        </button>
      )}
    </div>
  );
}
