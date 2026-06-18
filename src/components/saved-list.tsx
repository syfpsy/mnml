/**
 * saved-list.tsx — UI for the user-curated snippets section.
 *
 * Displays in compact view as its own section ("Snippets"). Behaviour:
 *   - Empty state: prompt + "+ Add" button.
 *   - Click a row: paste the snippet (uses `bridge.savedRestore` which
 *     copies to clipboard + arms auto-paste, mirroring clipboard restore).
 *   - Hover row: reveals × delete button (two-click confirm pattern).
 *   - "+ Add" button: expands an inline form (label + content textarea).
 *   - Keyboard: Tab into the list, Arrow up/down navigates, Enter activates.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { bridge } from "../lib/bridge";
import type { SavedSnippet } from "../types";
import { BookmarkIcon, PlusIcon, TrashIcon, XIcon } from "./icons";
import { QuickNum } from "./items-list";

const KEYBOARD_GRACE_MS = 250;

interface Props {
  snippets: SavedSnippet[];
  focusedIndex: number;
  onFocusedIndexChange: (index: number) => void;
  /** Called when user activates a snippet (paste). */
  onActivate: (snippet: SavedSnippet) => void;
  /** Copy to clipboard without auto-paste or hiding (Shift-click / Shift+Enter). */
  onCopyOnly?: (snippet: SavedSnippet) => void;
  /** Called when the up arrow is pressed at index 0 — lets the parent return focus to a prior section. */
  onArrowUpFromFirst?: () => void;
  /** Optional: filter context, displayed when the list is empty due to a query. */
  query?: string;
  listRef: RefObject<HTMLUListElement | null>;
}

export function SavedList({
  snippets,
  focusedIndex,
  onFocusedIndexChange,
  onActivate,
  onCopyOnly,
  onArrowUpFromFirst,
  query,
  listRef,
}: Props) {
  const [adding, setAdding] = useState(false);
  const lastKbdAt = useRef(0);

  const activeIndex = focusedIndex >= 0 && focusedIndex < snippets.length ? focusedIndex : -1;
  const activeId = activeIndex >= 0 ? savedRowId(snippets[activeIndex]) : undefined;

  const trimmedQuery = (query ?? "").trim();
  const empty        = snippets.length === 0;
  // Hide the section entirely when the user is searching and nothing matches —
  // an empty "Snippets" header with no rows is just visual noise.
  if (empty && !!trimmedQuery && !adding) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    lastKbdAt.current = Date.now();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (snippets.length === 0) return;
      onFocusedIndexChange(activeIndex < 0 ? 0 : Math.min(activeIndex + 1, snippets.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (activeIndex <= 0 && onArrowUpFromFirst) {
        onFocusedIndexChange(-1);
        onArrowUpFromFirst();
        return;
      }
      onFocusedIndexChange(activeIndex < 0 ? snippets.length - 1 : Math.max(activeIndex - 1, 0));
      return;
    }
    if (event.key === "Home") { event.preventDefault(); if (snippets.length) onFocusedIndexChange(0); return; }
    if (event.key === "End")  { event.preventDefault(); if (snippets.length) onFocusedIndexChange(snippets.length - 1); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      if (snippets.length === 0) return;
      const s = snippets[activeIndex >= 0 ? activeIndex : 0];
      if (event.shiftKey && onCopyOnly) onCopyOnly(s);
      else onActivate(s);
    }
  };

  return (
    <div className="mt-1 mnml-no-drag">
      <div className="flex items-center justify-between px-2 py-1">
        {/* Section label, not a document-outline heading. The compact view
            has no h1/h2 above this; promoting to h3 created a heading-level
            skip. <p> with styling is the honest choice. */}
        <p
          className="text-[11px] font-medium uppercase tracking-wide m-0"
          style={{ color: "var(--t3)" }}
        >
          Snippets
        </p>
        <button
          type="button"
          aria-label={adding ? "Cancel adding snippet" : "Add new snippet"}
          onClick={() => setAdding((v) => !v)}
          className={"p-1.5 rounded-md transition-colors " + (adding ? "" : "mnml-btn-ghost")}
          style={adding ? { color: "var(--accent-saved)" } : undefined}
        >
          {adding ? <XIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
        </button>
      </div>

      {adding && (
        <AddSnippetForm
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {empty && !adding && (
        <p
          className="px-2 py-2 text-[11px] leading-snug"
          style={{ color: "var(--t3)" }}
        >
          Click <span aria-hidden>+</span> to save a reusable text snippet.
        </p>
      )}

      {!empty && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Saved snippets"
          aria-activedescendant={activeId}
          tabIndex={0}
          data-mnml-listbox="true"
          onFocus={() => {
            if (focusedIndex < 0 && snippets.length > 0) onFocusedIndexChange(0);
          }}
          onKeyDown={onKeyDown}
          className="rounded-md"
        >
          {snippets.map((snippet, index) => {
            const selected = index === activeIndex;
            return (
              <SavedRow
                key={snippet.id}
                snippet={snippet}
                index={index}
                selected={selected}
                onActivate={() => onActivate(snippet)}
                onCopyOnly={onCopyOnly ? () => onCopyOnly(snippet) : undefined}
                onMouseEnter={() => {
                  if (Date.now() - lastKbdAt.current < KEYBOARD_GRACE_MS) return;
                  onFocusedIndexChange(index);
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function SavedRow({
  snippet, index, selected, onActivate, onCopyOnly, onMouseEnter,
}: {
  snippet: SavedSnippet;
  index: number;
  selected: boolean;
  onActivate: () => void;
  onCopyOnly?: () => void;
  onMouseEnter: () => void;
}) {
  const preview = snippet.content.split(/\r?\n/)[0]?.slice(0, 80) ?? "";

  return (
    <li
      id={savedRowId(snippet)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={(e) => {
        if (e.shiftKey && onCopyOnly) { onCopyOnly(); return; }
        onActivate();
      }}
      onMouseEnter={onMouseEnter}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
      style={{
        // Selection: stronger bg + 1 px full inset ring (replaces banned
        // side-stripe). Ring colour is the snippets accent.
        background: selected ? "var(--item-selected)" : "transparent",
        boxShadow:  selected ? "inset 0 0 0 1px var(--accent-saved)" : undefined,
      }}
    >
      <QuickNum idx={index} />
      <div
        className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
        style={{ background: "var(--accent-saved-bg)", color: "var(--accent-saved)" }}
      >
        <BookmarkIcon className="w-3.5 h-3.5" />
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <span
          className="text-[13px] truncate leading-tight font-medium"
          style={{ color: "var(--t1)" }}
        >
          {snippet.label}
        </span>
        {preview && preview !== snippet.label && (
          <span
            className="text-[11px] truncate leading-tight"
            style={{ color: "var(--t3)" }}
          >
            {preview}
          </span>
        )}
      </div>

      <DeleteSnippetBtn id={snippet.id} />
    </li>
  );
}

function DeleteSnippetBtn({ id }: { id: number }) {
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
      aria-label={armed ? "Confirm delete snippet" : "Delete snippet"}
      onClick={async (e) => {
        e.stopPropagation();
        if (armed) {
          disarm();
          try {
            await bridge.savedRemove(id);
          } catch {
            /* row stays — user can retry */
          }
        } else {
          arm();
        }
      }}
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

// ── Add form ──────────────────────────────────────────────────────────────────

function AddSnippetForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [label, setLabel]     = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving]   = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => { labelRef.current?.focus(); }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", fn, true);
    return () => window.removeEventListener("keydown", fn, true);
  }, [onCancel]);

  const submit = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      await bridge.savedAdd(label, content);
      setLabel(""); setContent("");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      data-mnml-snippet-form="true"
      className="px-2 py-2 flex flex-col gap-1.5 rounded-md"
      style={{ background: "var(--bg-raised)", boxShadow: "0 0 0 1px var(--border)" }}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <input
        ref={labelRef}
        type="text"
        name="snippet-label"
        autoComplete="off"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        aria-label="Snippet label"
        className="bg-transparent outline-none text-[12px] px-1 py-1 rounded-sm"
        style={{ color: "var(--t1)" }}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste or type the snippet content…"
        aria-label="Snippet content"
        rows={3}
        className="bg-transparent outline-none text-[12px] px-1 py-1 rounded-sm resize-none"
        style={{
          color: "var(--t1)",
          boxShadow: "inset 0 0 0 1px var(--border)",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-1.5 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="mnml-btn-ghost text-[11px] px-2 py-1 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!content.trim() || saving}
          className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--accent-saved-bg)", color: "var(--accent-saved-text)" }}
        >
          Save
        </button>
      </div>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>
        Tip: Ctrl+Enter to save quickly.
      </p>
    </form>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function savedRowId(snippet: SavedSnippet): string {
  return `saved-row-${snippet.id}`;
}
