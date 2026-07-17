import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SearchBar } from "./search-bar";
import { ItemsList } from "./items-list";
import { AppResultsList } from "./app-results-list";
import { SavedList } from "./saved-list";
import { SettingsIcon } from "./icons";
import { UpdateBanner, type UpdateState } from "./update-banner";
import { useItems } from "../hooks/use-items";
import { useAppSearch } from "../hooks/use-app-search";
import { useSaved } from "../hooks/use-saved";
import { bridge } from "../lib/bridge";
import { clearThumbCache } from "../lib/thumb-batch";
import type { AppResult, Item, ItemType, SavedSnippet, TabKey } from "../types";

const SettingsPanel = lazy(() =>
  import("./settings-panel").then((m) => ({ default: m.SettingsPanel })),
);

interface Props {
  onThemeChange: (light: boolean) => void;
  /** Update banner state — owned by app.tsx (subscribes to the
   *  electron-updater events) and passed here so the banner can render
   *  inside the same flex column as the footer. */
  updateState: UpdateState;
  updateVersion: string | null;
  onInstallUpdate: () => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all",   label: "All" },
  { key: "text",  label: "Text" },
  { key: "link",  label: "Links" },
  { key: "image", label: "Images" },
  { key: "saved", label: "Saved" },
];

const TYPE_BY_TAB: Record<Exclude<TabKey, "saved">, ItemType | undefined> = {
  all:   undefined,
  text:  "text",
  link:  "link",
  image: "image",
};

/** Mirror `ORDER BY` in electron/db/items.ts so pin toggles reorder without refetch. */
function sortItemsLikeDb(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const aPin = a.pinned_at != null;
    const bPin = b.pinned_at != null;
    if (aPin !== bPin) return aPin ? -1 : 1;
    if (aPin && bPin && a.pinned_at !== b.pinned_at) {
      return (b.pinned_at ?? 0) - (a.pinned_at ?? 0);
    }
    return b.updated_at - a.updated_at;
  });
}

export function CompactView({ onThemeChange, updateState, updateVersion, onInstallUpdate }: Props) {
  const [query,        setQuery]        = useState("");
  const [tab,          setTab]          = useState<TabKey>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isSavedTab = tab === "saved";

  const { items, setItems, refetch, searchPending } = useItems({
    query,
    type:    !isSavedTab ? TYPE_BY_TAB[tab as Exclude<TabKey, "saved">] : undefined,
    limit:   50,
    enabled: !isSavedTab,
  });

  // App + Settings results show inline alongside clipboard tabs whenever a
  // query is active. Skipped on the Saved tab where the search bar filters
  // snippets and app results would be hidden anyway.
  const appSearch  = useAppSearch(isSavedTab ? "" : query);
  const appResults = appSearch.results;

  const { snippets, refetch: refetchSaved } = useSaved(isSavedTab ? query : undefined, isSavedTab);

  const [focusedAppIndex,   setFocusedAppIndex]   = useState(-1);
  const [focusedSavedIndex, setFocusedSavedIndex] = useState(-1);
  /** Bumped on hide so SavedList remounts and drops any open add form. */
  const [savedListEpoch,    setSavedListEpoch]    = useState(0);
  const [summonHint,        setSummonHint]        = useState("Alt Alt");
  const [pasteRowHint,      setPasteRowHint]      = useState("Ctrl 1-9 paste");

  useEffect(() => {
    void bridge.getPlatformUi().then((p) => {
      setSummonHint(p.summonHint);
      setPasteRowHint(p.pasteRowHint);
    }).catch(() => { /* dev in browser */ });
  }, []);

  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLDivElement>(null);
  const appListRef   = useRef<HTMLUListElement>(null);
  const savedListRef = useRef<HTMLUListElement>(null);
  // Holds the latest quick-paste logic. A stable window-level keydown
  // listener (registered once, below) calls through this ref so it always
  // sees current `items` / `snippets` / tab without re-subscribing.
  const quickPasteRef = useRef<(n: number) => boolean>(() => false);
  /** Cancels a pending hide-reset if the user re-summons before rAF fires. */
  const hideResetGen   = useRef(0);
  const [thumbEpoch, setThumbEpoch] = useState(0);

  useEffect(() => {
    bridge.setBlurLock(settingsOpen);
    return () => { bridge.setBlurLock(false); };
  }, [settingsOpen]);

  // Frameless Windows overlays spuriously blur the HWND on tab/button clicks.
  // Tell main before React handlers run so blur/focus-watchdog don't hide us.
  const onInternalPointerDown = () => { void bridge.suppressBlurHide(); };

  // Summon refetch reads storage fresh on each show (see onVisibilityChanged).

  // Window visibility drives two things:
  //  · On HIDE — clear the search query. Summoning mnml again starts fresh
  //    rather than showing the previous search ("fresh window every Alt-Alt"
  //    mental model). The active tab is intentionally left alone. Always on.
  //  · On SHOW — only when using a synced folder: re-query the DB. The SQLite
  //    connection idle-closes between summons (see electron/db/index.ts), so
  //    anything another device synced in is on disk but not yet in React
  //    state. Refetching on summon makes folder-sync visible without a
  //    restart. Skipped for the default location — there's nothing to pick up.
  useEffect(() => {
    return bridge.onVisibilityChanged((visible) => {
      if (visible) {
        hideResetGen.current += 1;
        bridge.storageGet()
          .then((s) => {
            if (!s.isDefault) {
              refetch();
              refetchSaved();
            }
          })
          .catch(() => {});
        return;
      }
      const gen = hideResetGen.current;
      // Defer reset two frames so we never clear list chrome while the OS
      // window is still visible (belt-and-suspenders with main's deferred IPC).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gen !== hideResetGen.current) return;
          setQuery("");
          setSettingsOpen(false);
          setSavedListEpoch((n) => n + 1);
          clearThumbCache();
          setThumbEpoch((n) => n + 1);
        });
      });
    });
  }, [refetch, refetchSaved]);

  // Quick-paste hotkeys: Ctrl+1..9. Registered once on the window so it
  // works whether focus is in the search field or the list. Bare digits are
  // left for typing into search; Alt is avoided (double-Alt summon + Windows
  // alt-codes). Routes through `quickPasteRef` so it always sees current
  // state without re-subscribing on every render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      if (e.key < "1" || e.key > "9") return;          // single-digit 1..9 only
      if (quickPasteRef.current(Number(e.key))) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset section focus whenever the underlying lists change.
  useEffect(() => { setFocusedAppIndex(-1);   }, [query, appResults.length, tab]);
  useEffect(() => { setFocusedSavedIndex(-1); }, [query, snippets.length, tab]);

  // ── Focus helpers ───────────────────────────────────────────────────────

  const focusList = () => {
    if (isSavedTab) { focusSavedList(); return; }
    // ItemsList uses `role="listbox"` after the v0.2.31 ARIA-semantics fix.
    const list = listRef.current?.querySelector<HTMLElement>('[role="listbox"]');
    if (list) { list.focus(); return; }
    if (appResults.length > 0) focusAppList();
  };

  const focusAppList = () => {
    if (appResults.length === 0) return;
    setFocusedAppIndex(0);
    appListRef.current?.focus();
  };

  const focusSavedList = () => {
    if (snippets.length === 0) return;
    setFocusedSavedIndex(0);
    savedListRef.current?.focus();
  };

  const focusClipboardEnd = () => {
    // ItemsList uses listbox / option semantics — same row-end signal as
    // before, just via the corrected role.
    const list = listRef.current?.querySelector<HTMLElement>('[role="listbox"]');
    if (!list) { focusList(); return; }
    const rows = list.querySelectorAll<HTMLElement>('[role="option"]');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      // Trigger the listbox's `aria-activedescendant` by focusing the
      // container and dispatching an End key — keeps internal state in
      // sync (rather than calling .focus() on a tabIndex=-1 row).
      list.focus();
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      return;
    }
    focusList();
  };

  const handleClipboardKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" || items.length === 0 || appResults.length === 0) return;
    if (!isClipboardEndActive(listRef.current)) return;

    event.preventDefault();
    event.stopPropagation();
    focusAppList();
  };

  // ── Activation ──────────────────────────────────────────────────────────

  const activate      = async (item: Item)        => { void bridge.suppressBlurHide(); await bridge.restore(item.id, true); };
  const activateApp   = async (result: AppResult) => {
    void bridge.suppressBlurHide();
    const ok = await bridge.appLaunch(result.target);
    if (ok) await bridge.hide();
  };
  const activateSaved = async (s: SavedSnippet)   => { void bridge.suppressBlurHide(); await bridge.savedRestore(s.id, true); };
  const copyOnly      = async (item: Item)        => { await bridge.restore(item.id); };
  const copyOnlySaved = async (s: SavedSnippet)   => { await bridge.savedRestore(s.id, false); };

  const focusSearch = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  };

  // Quick-paste: Ctrl+1..9 activates the Nth item of the current tab's
  // primary list (clipboard items, or snippets on the Saved tab). The
  // window-level listener is registered once; this assignment keeps the
  // closure current every render. Returns true when a paste was triggered.
  quickPasteRef.current = (n: number) => {
    if (settingsOpen) return false;
    const el = document.activeElement;
    if (el?.closest("[data-mnml-snippet-form]")) return false;
    if (searchPending) return false;
    if (!isSavedTab && appSearch.isSearching) return false;
    if (isSavedTab) {
      const s = snippets[n - 1];
      if (!s) return false;
      void activateSaved(s);
      return true;
    }
    const item = items[n - 1];
    if (!item) return false;
    void activate(item);
    return true;
  };

  const togglePin = async (item: Item) => {
    const nowPinned = item.pinned_at == null;
    const pinnedAt = nowPinned ? Date.now() : null;
    const prev = items;
    setItems((p) => sortItemsLikeDb(
      p.map((row) => (row.id === item.id ? { ...row, pinned_at: pinnedAt } : row)),
    ));
    try {
      await bridge.pin(item.id, nowPinned);
    } catch {
      setItems(prev);
    }
  };

  const handleRemove = async (id: number) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    try {
      await bridge.remove(id);
    } catch {
      refetch();
    }
  };

  const handleSave = async (item: Item) => {
    try {
      await bridge.savedFromItem(item.id);
    } catch {
      /* SaveBtn handles confirmation — errors stay silent here */
    }
  };

  const ariaLabel   = isSavedTab ? "Filter saved snippets" : "Search clipboard";
  const placeholder = isSavedTab ? "Filter snippets…" : undefined;

  // Hide the clipboard list's empty state when apps + settings are providing
  // useful content. Otherwise the user sees a misleading "No matches" above
  // a perfectly fine app result.
  const showClipboardList =
    searchPending ||
    items.length > 0 ||
    !query.trim() ||
    (appResults.length === 0 && !appSearch.isSearching);

  return (
    <div className="relative h-full flex flex-col" onMouseDownCapture={onInternalPointerDown}>
    {/* The non-modal subtree is `inert`-ed whenever Settings is open. Pairs
        with the `aria-modal="true"` on <SettingsPanel> so focus, pointer,
        and assistive-tech navigation can't leak from the sheet into the
        compact view underneath. The UpdateBanner + Footer below are
        siblings of this subtree so they remain interactive while Settings
        is open (you can still click "Restart now" on the banner). */}
    <div
      className="flex-1 flex flex-col min-h-0"
      inert={settingsOpen}
      onKeyDownCapture={(e) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        if (t.closest('[role="tab"]') || t.closest("button")) onInternalPointerDown();
      }}
    >

      {/* Header */}
      <div className="mnml-drag px-2.5 pt-2 pb-2 flex items-center gap-2">
        <div className="flex-1">
          <SearchBar
            value={query}
            onChange={setQuery}
            inputRef={inputRef}
            ariaLabel={ariaLabel}
            placeholder={placeholder}
            onArrowDown={focusList}
            onArrowUp={() => {}}
            onHome={() => {}}
            onEnd={() => {}}
            onEnter={(e) => {
              if (!isSavedTab && (searchPending || appSearch.isSearching)) return;
              if (isSavedTab) {
                const s = snippets[0];
                if (s) activateSaved(s);
                return;
              }
              const item = items[0];
              if (item) {
                if (e.shiftKey) copyOnly(item); else activate(item);
                return;
              }
              const r = appResults[0];
              if (r) activateApp(r);
            }}
            onDelete={() => {
              if (isSavedTab || searchPending) return;
              const item = items[0];
              if (item) handleRemove(item.id);
            }}
            onEscape={() => bridge.hide()}
          />
        </div>
        <IconBtn label="Settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="w-4 h-4" />
        </IconBtn>
      </div>

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Categories"
        className="mnml-no-drag flex items-center gap-0.5 px-2.5 pt-1 pb-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map((t) => (
          <TabBtn
            key={t.key}
            label={t.label}
            active={tab === t.key}
            panelId={`tab-panel-${t.key}`}
            onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      {/* Content */}
      <div
        role="tabpanel"
        id={`tab-panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="flex-1 overflow-y-auto mnml-scroll px-1.5 pb-1.5 pt-1"
      >
        {isSavedTab ? (
          <SavedList
            key={savedListEpoch}
            snippets={snippets}
            focusedIndex={focusedSavedIndex}
            onFocusedIndexChange={setFocusedSavedIndex}
            onActivate={activateSaved}
            onCopyOnly={copyOnlySaved}
            onArrowUpFromFirst={focusSearch}
            query={query}
            listRef={savedListRef}
          />
        ) : (
          <>
            {showClipboardList && (
              <ItemsList
                items={items}
                onActivate={activate}
                onCopyOnly={copyOnly}
                onRemove={handleRemove}
                onPinToggle={togglePin}
                onSave={handleSave}
                query={query}
                isLoading={searchPending}
                onArrowUpFromFirst={focusSearch}
                listRef={listRef}
                onKeyDownCapture={handleClipboardKeyDownCapture}
                thumbEpoch={thumbEpoch}
                emptyHint={
                  tab === "image" ? "No images captured yet." :
                  tab === "link"  ? "No links captured yet." :
                  tab === "text"  ? "No text captured yet." :
                  "Copy any text, link, or image."
                }
              />
            )}
            {/* Apps + Windows Settings: only when actively searching. */}
            {query.trim() && (
              <AppResultsList
                results={appResults}
                isSearching={appSearch.isSearching}
                focusedIndex={focusedAppIndex}
                onFocusedIndexChange={setFocusedAppIndex}
                onActivate={activateApp}
                onArrowUpFromFirst={items.length > 0 ? focusClipboardEnd : undefined}
                listRef={appListRef}
              />
            )}
          </>
        )}
      </div>

    </div>{/* /inert subtree */}

      {/* Update banner — only renders when state ≠ "idle" (returns null
          otherwise, taking no flex height). Sits directly above the footer
          when active; pushes the content area up by its own height rather
          than overlaying. */}
      <UpdateBanner
        state={updateState}
        version={updateVersion}
        onInstall={onInstallUpdate}
      />

      {/* Footer — global keyboard / paste hints. Static text, always at
          the bottom of the flex column. Outside the inert wrapper for
          symmetry with the banner (and because it's just text anyway). */}
      <div
        className="px-3 py-1.5 flex items-center justify-between text-[11px]"
        style={{ borderTop: "1px solid var(--border)", color: "var(--t3)" }}
      >
        <span>{pasteRowHint} · Shift-click copy · Esc dismiss · Hover row for actions</span>
        <span>{summonHint} to toggle</span>
      </div>

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            onThemeChange={onThemeChange}
          />
        </Suspense>
      )}
    </div>
  );
}

function isClipboardEndActive(container: HTMLDivElement | null): boolean {
  if (!container) return false;

  const rows = Array.from(
    container.querySelectorAll<HTMLElement>('[role="option"]'),
  );
  const lastRow = rows.at(-1);
  if (!lastRow) return false;

  const activeElement = document.activeElement;
  if (activeElement && lastRow.contains(activeElement)) return true;

  const list = container.querySelector<HTMLElement>('[role="listbox"]');
  const activeDescendant = list?.getAttribute("aria-activedescendant");
  if (!activeDescendant) return false;

  const activeDescendantElement = document.getElementById(activeDescendant);
  return lastRow.id === activeDescendant || Boolean(activeDescendantElement && lastRow.contains(activeDescendantElement));
}

function IconBtn({ children, label, onClick }: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  // `mnml-btn-ghost` handles colour-on-hover via CSS. The bg-on-hover bit
  // stays inline because Tailwind's `hover:` modifier doesn't cascade into
  // the .mnml-btn-ghost selector chain in v4.
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="mnml-no-drag mnml-btn-ghost shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--item-hover)]"
    >
      {children}
    </button>
  );
}

function TabBtn({ label, active, onClick, panelId }: {
  label: string;
  active: boolean;
  onClick: () => void;
  panelId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={panelId.replace(/-panel-/g, "-")}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={
        "px-2.5 py-1.5 min-h-[28px] text-[11px] rounded-md rounded-b-none transition-colors " +
        (active ? "" : "mnml-btn-ghost")
      }
      style={{
        color:        active ? "var(--t1)" : undefined,
        background:   active ? "var(--item-active)" : "transparent",
        borderBottom: active ? "2px solid var(--t2)" : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {label}
    </button>
  );
}
