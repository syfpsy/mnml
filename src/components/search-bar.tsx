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
  /** Called when Delete is pressed while the input is empty — removes active item. */
  onDelete?: () => void;
  placeholder?: string;
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
  placeholder = "Search…",
  autoFocus = true,
  inputRef,
}: Props) {
  return (
    <div
      className="mnml-no-drag flex items-center gap-2 h-9 px-3 rounded-lg transition-shadow"
      style={{
        background: "var(--bg-raised)",
        boxShadow: "0 0 0 1px var(--border)",
      }}
      /* focus-within via JS: update ring on focus */
      onFocusCapture={(e) => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--border-focus)")}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          e.currentTarget.style.boxShadow = "0 0 0 1px var(--border)";
      }}
    >
      <SearchIcon className="w-[14px] h-[14px] shrink-0" style={{ color: "var(--t3)" }} />

      <input
        ref={inputRef}
        aria-label="Search clipboard"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
        style={{ color: "var(--t1)" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown")                    { e.preventDefault(); onArrowDown?.(); }
          else if (e.key === "ArrowUp")                 { e.preventDefault(); onArrowUp?.(); }
          else if (e.key === "Home" && e.ctrlKey)       { e.preventDefault(); onHome?.(); }
          else if (e.key === "End"  && e.ctrlKey)       { e.preventDefault(); onEnd?.(); }
          else if (e.key === "Enter")                   { e.preventDefault(); onEnter?.(e); }
          else if (e.key === "Delete" && !value)        { e.preventDefault(); onDelete?.(); }
          else if (e.key === "Escape") {
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
          className="shrink-0 transition-colors"
          style={{ color: "var(--t3)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t2)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t3)")}
        >
          <XIcon className="w-[14px] h-[14px]" />
        </button>
      )}
    </div>
  );
}
