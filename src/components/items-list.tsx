/**
 * items-list.tsx — clipboard history list.
 *
 * Plain HTML, no UI library. With ≤200 rows we don't need virtualisation.
 *
 * ARIA: a single-column list is a `role="listbox"` / `role="option"`
 * composite, not `role="grid"`. We use `aria-activedescendant` for virtual
 * focus on the container; rows are `tabIndex={-1}`.
 *
 * Selectors the rest of the app depends on:
 *   - `[role="listbox"]`               on the container — `compact-view.focusList()`
 *   - `[role="option"]`                on each row     — `isClipboardEndActive()`
 *   - `aria-activedescendant`          on the container
 *   - row `id="item-row-<id>"`         referenced by aria-activedescendant
 *
 * Per-type colour comes from CSS tokens (`--accent-text/link/image` family)
 * so the list themes correctly. Selection indicator is a 1 px FULL inset
 * ring (frontend-design absolute bans prohibit side-stripes).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { bridge } from "../lib/bridge";
import { requestThumbUrl } from "../lib/thumb-batch";
import { timeAgo, splitHighlight } from "../lib/format";
import type { Item, ItemType } from "../types";
import {
  BookmarkIcon,
  CheckIcon,
  ImageIcon,
  LinkIcon,
  PinFilledIcon,
  PinIcon,
  TextIcon,
  TrashIcon,
} from "./icons";

const KEYBOARD_GRACE_MS = 250;

interface Props {
  items: Item[];
  onActivate: (item: Item) => void;
  /** Copy to clipboard without auto-paste or hiding (Shift-click / Shift+Enter). */
  onCopyOnly?: (item: Item) => void;
  onRemove: (id: number) => void;
  onPinToggle: (item: Item) => void;
  /** Optional quick-save: clipboard item → saved snippet. */
  onSave?: (item: Item) => void;
  query: string;
  emptyHint?: string;
  /** True while a debounced search fetch is in flight. */
  isLoading?: boolean;
  /** When ArrowUp is pressed on the first row, return focus to search (etc.). */
  onArrowUpFromFirst?: () => void;
  listRef?: React.RefObject<HTMLDivElement | null>;
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
}

/**
 * Per-type CSS variable names. The actual colour values live in `styles.css`
 * and theme automatically. Each row reads `--item-tint` / `--item-tint-hover`
 * from its inline style.
 */
const TYPE_VARS: Record<ItemType, {
  bg: string; icon: string; row: string; rowHover: string;
}> = {
  text:  { bg: "var(--accent-text-bg)",  icon: "var(--accent-text)",  row: "var(--accent-text-row)",  rowHover: "var(--accent-text-row-hover)"  },
  link:  { bg: "var(--accent-link-bg)",  icon: "var(--accent-link)",  row: "var(--accent-link-row)",  rowHover: "var(--accent-link-row-hover)"  },
  image: { bg: "var(--accent-image-bg)", icon: "var(--accent-image)", row: "var(--accent-image-row)", rowHover: "var(--accent-image-row-hover)" },
};

export function ItemsList({
  items, onActivate, onCopyOnly, onRemove, onPinToggle, onSave,
  query, emptyHint, isLoading = false, onArrowUpFromFirst, listRef, onKeyDownCapture,
}: Props) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const lastKbdAt = useRef(0);
  const listEl    = useRef<HTMLDivElement>(null);
  const orderKey  = useMemo(
    () => items.map((i) => `${i.id}:${i.pinned_at ?? ""}`).join("|"),
    [items],
  );

  useEffect(() => { setFocusedIndex(-1); }, [orderKey, query]);

  const activeId =
    focusedIndex >= 0 && focusedIndex < items.length
      ? rowId(items[focusedIndex])
      : undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    lastKbdAt.current = Date.now();
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i < 0 ? 0 : Math.min(i + 1, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (focusedIndex <= 0 && onArrowUpFromFirst) {
        setFocusedIndex(-1);
        onArrowUpFromFirst();
        return;
      }
      setFocusedIndex((i) => (i <= 0 ? 0 : i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(items.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const i = focusedIndex >= 0 ? focusedIndex : 0;
      const item = items[i];
      if (!item) return;
      if (e.shiftKey && onCopyOnly) onCopyOnly(item);
      else onActivate(item);
    }
  };

  // Empty state — render a listbox container so compact-view's focus helper
  // still finds a tab-stop in the list region.
  if (items.length === 0) {
    return (
      <div
        ref={listRef}
        className="mnml-no-drag"
        onKeyDownCapture={onKeyDownCapture}
      >
        <div
          ref={listEl}
          role="listbox"
          aria-label="Clipboard history"
          tabIndex={0}
          className="flex flex-col items-center gap-1 text-center py-6 rounded-md"
        >
          <p className="text-[13px]" style={{ color: "var(--t2)" }}>
            {query
              ? (isLoading ? "Searching…" : "No matches")
              : "Nothing here yet"}
          </p>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            {query
              ? (isLoading ? "Hang on a moment." : "Try different words.")
              : emptyHint ?? "Copy any text, link, or image."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="mnml-no-drag"
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        ref={listEl}
        role="listbox"
        aria-label="Clipboard history"
        aria-activedescendant={activeId}
        tabIndex={0}
        onFocus={() => {
          if (focusedIndex < 0 && items.length > 0) setFocusedIndex(0);
        }}
        onKeyDown={onKeyDown}
        className="rounded-md"
      >
        {items.map((item, idx) => {
          const tint    = TYPE_VARS[item.type];
          const focused = idx === focusedIndex;
          return (
            <div
              key={item.id}
              id={rowId(item)}
              role="option"
              aria-selected={focused}
              tabIndex={-1}
              onMouseDown={() => { void bridge.suppressBlurHide(); }}
              onClick={(e) => {
                if (e.shiftKey && onCopyOnly) { onCopyOnly(item); return; }
                onActivate(item);
              }}
              onMouseEnter={() => {
                if (Date.now() - lastKbdAt.current < KEYBOARD_GRACE_MS) return;
                setFocusedIndex(idx);
              }}
              className="mnml-row group flex items-center gap-2 px-2 py-1.5 cursor-pointer"
              style={{
                // CSS variables for the row tints. The `.mnml-row` CSS rule
                // reads these for the idle + hover states.
                ["--item-tint"       as never]: tint.row,
                ["--item-tint-hover" as never]: tint.rowHover,
                // Selected state — full 1 px inset ring in the category accent
                // (replaces the previously-banned side-stripe). Bg shifts to
                // `--item-selected` for additional reinforcement.
                background: focused ? "var(--item-selected)" : undefined,
                boxShadow:  focused ? `inset 0 0 0 1px ${tint.icon}` : undefined,
                borderRadius: focused ? 4 : undefined,
              }}
            >
              <QuickNum idx={idx} />
              <TypeIcon item={item} tint={tint} />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span
                  className={
                    "text-[13px] leading-tight font-medium " +
                    (item.type === "text" ? "line-clamp-2 break-words" : "truncate")
                  }
                  style={{ color: "var(--t1)" }}
                >
                  <ItemTitle item={item} query={query} />
                </span>
                <ItemDescLine item={item} />
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <span className="text-[11px] tabular-nums mr-1" style={{ color: "var(--t3)" }}>
                  {timeAgo(item.updated_at)}
                </span>
                {onSave && item.type !== "image" && (
                  <SaveBtn onSave={() => onSave(item)} />
                )}
                <ActionBtn
                  label={item.pinned_at != null ? "Unpin" : "Pin"}
                  onClick={() => onPinToggle(item)}
                  alwaysVisible={item.pinned_at != null}
                  color={item.pinned_at != null ? "var(--accent-pinned)" : undefined}
                >
                  {item.pinned_at != null
                    ? <PinFilledIcon className="w-3.5 h-3.5" />
                    : <PinIcon       className="w-3.5 h-3.5" />}
                </ActionBtn>
                <DeleteBtn onRemove={() => onRemove(item.id)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rowId(item: Item): string {
  return `item-row-${item.id}`;
}

/**
 * Quick-paste index badge. Shows the digit (1..9) you press with Ctrl to
 * paste this row instantly — see the window keydown handler in
 * `compact-view.tsx`. Rows past the 9th keep the gutter width but render
 * nothing, so every row stays left-aligned. Shared by `items-list` and
 * `saved-list`.
 */
export function QuickNum({ idx }: { idx: number }) {
  return (
    <span
      aria-hidden
      className="w-3 shrink-0 text-center text-[10px] leading-none tabular-nums"
      style={{ color: "var(--t3)", visibility: idx < 9 ? "visible" : "hidden" }}
    >
      {idx < 9 ? idx + 1 : ""}
    </span>
  );
}

/* ── Action button ────────────────────────────────────────────────────────── */
function ActionBtn({ children, label, onClick, alwaysVisible = false, color }: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  alwaysVisible?: boolean;
  color?: string;
}) {
  // p-1.5 → ~26 px hit target (was p-1 / ~22 px). Meets WCAG 2.5.8 24 × 24.
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={[
        "p-1.5 rounded-md transition-colors",
        // When `color` is set (pinned), keep it always visible without
        // hover-recolouring. Otherwise this is a ghost icon button.
        color ? "" : "mnml-btn-ghost",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100",
      ].join(" ").trim()}
      style={color ? { color } : undefined}
    >
      {children}
    </button>
  );
}

/* ── Save button — one-click save to snippets, brief confirmation pulse ──── */
function SaveBtn({ onSave }: { onSave: () => void | Promise<void> }) {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const trigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saved) return;
    try {
      await onSave();
      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 1500);
    } catch {
      /* keep unsaved state — no false confirmation */
    }
  };

  return (
    <button
      type="button"
      aria-label={saved ? "Saved as snippet" : "Save as snippet"}
      onClick={trigger}
      className={[
        "p-1.5 rounded-md transition-colors",
        saved ? "" : "mnml-btn-ghost",
        saved
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100",
      ].join(" ").trim()}
      style={saved ? { color: "var(--accent-saved)" } : undefined}
    >
      {saved
        ? <CheckIcon    className="w-3.5 h-3.5" />
        : <BookmarkIcon className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Delete button — two-click confirmation ───────────────────────────────── */
function DeleteBtn({ onRemove }: { onRemove: () => void }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    setArmed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setArmed(false), 2000);
  };
  const disarm = () => {
    setArmed(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <button
      type="button"
      aria-label={armed ? "Confirm delete" : "Delete"}
      onClick={(e) => { e.stopPropagation(); if (armed) { disarm(); onRemove(); } else { arm(); } }}
      onBlur={disarm}
      className={[
        "p-1.5 rounded-md transition-colors",
        armed ? "" : "mnml-btn-ghost",
        armed
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100",
      ].join(" ").trim()}
      style={armed ? { color: "var(--accent-danger)" } : undefined}
    >
      <TrashIcon className="w-3.5 h-3.5" />
    </button>
  );
}

/* ── Type icon ────────────────────────────────────────────────────────────── */

interface TintVars {
  bg: string;
  icon: string;
  row: string;
  rowHover: string;
}

function TypeIcon({ item, tint }: { item: Item; tint: TintVars }) {
  if (item.type === "image") return <ImageThumb item={item} tint={tint} />;
  if (item.type === "link")  return <FaviconOrIcon item={item} tint={tint} />;
  return (
    <div
      className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
      style={{ background: tint.bg, color: tint.icon }}
    >
      <TextIcon className="w-3 h-3" />
    </div>
  );
}

function ImageThumb({ item, tint }: { item: Item; tint: TintVars }) {
  const [url, setUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let unsub: (() => void) | null = null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        unsub = requestThumbUrl(item.id, setUrl);
      },
      { root: el.closest('[role="listbox"]'), threshold: 0.01 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      unsub?.();
    };
  }, [item.id]);

  return (
    <div
      ref={rootRef}
      className="w-6 h-6 shrink-0 rounded-md overflow-hidden"
      style={{ background: tint.bg }}
    >
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center" style={{ color: tint.icon }}>
            <ImageIcon className="w-3 h-3" />
          </div>}
    </div>
  );
}

function FaviconOrIcon({ item, tint }: { item: Item; tint: TintVars }) {
  return (
    <div
      className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
      style={{ background: tint.bg, color: tint.icon }}
    >
      <LinkIcon className="w-3 h-3" />
    </div>
  );
}

/* ── Title content ────────────────────────────────────────────────────────── */
function Hl({ text, query }: { text: string; query: string }) {
  const parts = splitHighlight(text, query);
  if (parts.length === 1 && !parts[0][1]) return <>{text}</>;
  return (
    <>
      {parts.map(([chunk, isMatch], i) =>
        isMatch
          ? <mark
              key={i}
              className="rounded-[2px] px-px not-italic"
              style={{ background: "var(--accent-highlight-bg)", color: "var(--t1)" }}
            >{chunk}</mark>
          : chunk,
      )}
    </>
  );
}

function ItemTitle({ item, query }: { item: Item; query: string }) {
  if (item.type === "image") return <>Image</>;
  if (item.type === "link") {
    const primary = item.title || item.hostname || item.content_url || "";
    return <Hl text={primary} query={query} />;
  }
  return <Hl text={item.preview} query={query} />;
}

/* ── Description line (secondary text under title) ────────────────────────── */
function ItemDescLine({ item }: { item: Item }) {
  if (item.type === "link") {
    const primary = item.title || item.hostname || item.content_url || "";
    const secondary = item.hostname && item.hostname !== primary ? item.hostname : null;
    if (!secondary) return null;
    return (
      <span className="text-[11px] truncate leading-tight" style={{ color: "var(--t3)" }}>
        {secondary}
      </span>
    );
  }
  if (item.type === "image") {
    const size = item.title ?? item.preview;
    const kb   = item.byte_size ? `${Math.max(1, Math.round(item.byte_size / 1024))} KB` : null;
    const desc = [size, kb].filter(Boolean).join(" · ");
    if (!desc) return null;
    return (
      <span className="text-[11px] truncate leading-tight" style={{ color: "var(--t3)" }}>
        {desc}
      </span>
    );
  }
  return null;
}
