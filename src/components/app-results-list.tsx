import { useRef, type KeyboardEvent, type RefObject } from "react";
import type { AppResult } from "../types";
import { AppIcon, FileIcon, FolderIcon } from "./icons";

/**
 * After a keyboard event we ignore mouseenter for this many ms. Without
 * this, resting the cursor over a non-active row while pressing Arrow keys
 * causes mouseenter to fight the keyboard selection.
 */
const KEYBOARD_GRACE_MS = 250;

interface Props {
  results: AppResult[];
  isSearching: boolean;
  focusedIndex: number;
  onFocusedIndexChange: (index: number) => void;
  onActivate: (result: AppResult) => void;
  onArrowUpFromFirst?: () => void;
  emptyLabel?: string;
  listRef: RefObject<HTMLUListElement | null>;
}

export function AppResultsList({
  results,
  isSearching,
  focusedIndex,
  onFocusedIndexChange,
  onActivate,
  onArrowUpFromFirst,
  emptyLabel,
  listRef,
}: Props) {
  // useRef before any conditional returns — rules of hooks.
  const lastKbdAt = useRef(0);

  if (results.length === 0 && !isSearching && !emptyLabel) return null;

  const activeIndex = focusedIndex >= 0 && focusedIndex < results.length ? focusedIndex : -1;
  const activeId = activeIndex >= 0 ? appResultId(results[activeIndex]) : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    lastKbdAt.current = Date.now();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      onFocusedIndexChange(activeIndex < 0 ? 0 : Math.min(activeIndex + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (activeIndex <= 0 && onArrowUpFromFirst) {
        onFocusedIndexChange(-1);
        onArrowUpFromFirst();
        return;
      }
      onFocusedIndexChange(activeIndex < 0 ? results.length - 1 : Math.max(activeIndex - 1, 0));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (results.length === 0) return;
      onFocusedIndexChange(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (results.length === 0) return;
      onFocusedIndexChange(results.length - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (isSearching || results.length === 0) return;
      onActivate(results[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  return (
    <div className="mt-1 mnml-no-drag">
      {/* Section label, not a document-outline heading. See the matching
          comment in `saved-list.tsx` for why this is <p>. */}
      <p
        className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide m-0"
        style={{ color: "var(--t3)" }}
      >
        Apps &amp; Settings
      </p>

      <ul
        ref={listRef}
        role="listbox"
        aria-label="Apps and Windows settings"
        aria-activedescendant={activeId}
        tabIndex={0}
        data-mnml-listbox="true"
        onFocus={() => {
          if (focusedIndex < 0 && results.length > 0) onFocusedIndexChange(0);
        }}
        onKeyDown={onKeyDown}
        className="rounded-md"
      >
        {isSearching && <StatusRow label="Searching apps & settings…" />}
        {!isSearching && results.length === 0 && emptyLabel && (
          <StatusRow label={emptyLabel} />
        )}
        {results.map((result, index) => {
          const selected = index === activeIndex;
          return (
            <li
              id={appResultId(result)}
              key={result.id}
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => onActivate(result)}
              onMouseEnter={() => {
                if (Date.now() - lastKbdAt.current < KEYBOARD_GRACE_MS) return;
                onFocusedIndexChange(index);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
              style={{
                // Selection: stronger bg + 1 px full inset ring in accent.
                // Replaces the v0.2.21 side-stripe (banned anti-pattern).
                background: selected ? "var(--item-selected)" : "transparent",
                boxShadow:  selected ? "inset 0 0 0 1px var(--accent-app)" : undefined,
              }}
            >
              <ResultIcon result={result} />

              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span
                  className="text-[13px] truncate leading-tight font-medium"
                  style={{ color: "var(--t1)" }}
                >
                  {result.name}
                </span>
                <span
                  className="text-[11px] truncate leading-tight"
                  style={{ color: "var(--t3)" }}
                >
                  {kindHint(result)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusRow({ label }: { label: string }) {
  return (
    <li
      role="presentation"
      className="px-2 py-1.5 text-[11px]"
      style={{ color: "var(--t3)" }}
    >
      {label}
    </li>
  );
}

function ResultIcon({ result }: { result: AppResult }) {
  return (
    <div
      className="w-6 h-6 shrink-0 rounded-md overflow-hidden flex items-center justify-center"
      style={{ background: "var(--accent-app-bg)", color: "var(--accent-app)" }}
    >
      {result.icon ? (
        <img src={result.icon} alt="" className="w-5 h-5 object-contain" />
      ) : result.kind === "setting" ? (
        // Settings get a "gear-like" suggestion via the Folder glyph for now.
        // Keeping the existing icon set lean; can swap for a SettingsIcon later.
        <FolderIcon className="w-3.5 h-3.5" />
      ) : result.kind === "tool" ? (
        <FileIcon className="w-3.5 h-3.5" />
      ) : (
        <AppIcon className="w-3.5 h-3.5" />
      )}
    </div>
  );
}

function appResultId(result: AppResult): string {
  return `app-result-${hashString(result.id)}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function kindHint(result: AppResult): string {
  if (result.kind === "setting") return "Windows Settings";
  if (result.kind === "tool") return "System tool";
  return "App";
}
