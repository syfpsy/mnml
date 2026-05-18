import { useEffect, useRef, useState } from "react";
import { SearchBar } from "./search-bar";
import { ItemsList } from "./items-list";
import { AppResultsList } from "./app-results-list";
import { SavedList } from "./saved-list";
import { SettingsIcon } from "./icons";
import { SettingsPanel } from "./settings-panel";
import { UpdateBanner, type UpdateState } from "./update-banner";
import { useItems } from "../hooks/use-items";
import { useAppSearch } from "../hooks/use-app-search";
import { useSaved } from "../hooks/use-saved";
import { bridge } from "../lib/bridge";
import type { AppResult, Item, ItemType, SavedSnippet, TabKey } from "../types";

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

export function CompactView({ onThemeChange, updateState, updateVersion, onInstallUpdate }: Props) {
  const [query,        setQuery]        = useState("");
  const [tab,          setTab]          = useState<TabKey>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isSavedTab = tab === "saved";

  const { items, setItems, refetch } = useItems({
    query,
    type:    !isSavedTab ? TYPE_BY_TAB[tab as Exclude<TabKey, "saved">] : undefined,
    limit:   100,
    enabled: !isSavedTab,
  });

  // App + Settings results show inline alongside clipboard tabs whenever a
  // query is active. Skipped on the Saved tab where the search bar filters
  // snippets and app results would be hidden anyway.
  const appSearch  = useAppSearch(isSavedTab ? "" : query);
  const appResults = appSearch.results;

  const { snippets, refetch: refetchSaved } = useSaved(isSavedTab ? query : undefined);

  const [focusedAppIndex,   setFocusedAppIndex]   = useState(-1);
  const [focusedSavedIndex, setFocusedSavedIndex] = useState(-1);

  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLDivElement>(null);
  const appListRef   = useRef<HTMLUListElement>(null);
  const savedListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    bridge.setBlurLock(settingsOpen);
    return () => { bridge.setBlurLock(false); };
  }, [settingsOpen]);

  // Window visibility drives two things:
  //  · On HIDE — clear the search query. Summoning mnml again starts fresh
  //    rather than showing the previous search ("fresh window every Alt-Alt"
  //    mental model). The active tab is intentionally left alone.
  //  · On SHOW — re-query the DB. The SQLite connection idle-closes between
  //    summons (see electron/db/index.ts), so anything another device
  //    synced into a shared folder is on disk but not yet in React state.
  //    Refetching on summon makes folder-sync visible without a restart.
  useEffect(() => {
    return bridge.onVisibilityChanged((visible) => {
      if (!visible) {
        setQuery("");
      } else {
        refetch();
        refetchSaved();
      }
    });
  }, [refetch, refetchSaved]);

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

  const activate      = async (item: Item)        => { await bridge.restore(item.id, true); await bridge.hide(); };
  const activateApp   = async (result: AppResult) => { try { await bridge.appLaunch(result.target); } finally { await bridge.hide(); } };
  const activateSaved = async (s: SavedSnippet)   => { await bridge.savedRestore(s.id, true); await bridge.hide(); };
  const copyOnly      = async (item: Item)        => { await bridge.restore(item.id); };

  const togglePin = async (item: Item) => {
    const nowPinned = item.pinned_at == null;
    setItems((prev) => prev.map((p) =>
      p.id === item.id ? { ...p, pinned_at: nowPinned ? Date.now() : null } : p,
    ));
    await bridge.pin(item.id, nowPinned);
    refetch();
  };

  const handleRemove = async (id: number) => {
    const next = items.filter((p) => p.id !== id);
    await bridge.remove(id);
    setItems(next);
  };

  const handleSave = async (item: Item) => {
    await bridge.savedFromItem(item.id);
  };

  const ariaLabel   = isSavedTab ? "Filter saved snippets" : "Search clipboard";
  const placeholder = isSavedTab ? "Filter snippets…" : undefined;

  // Hide the clipboard list's empty state when apps + settings are providing
  // useful content. Otherwise the user sees a misleading "No matches" above
  // a perfectly fine app result.
  const showClipboardList =
    items.length > 0 ||
    !query.trim() ||
    (appResults.length === 0 && !appSearch.isSearching);

  return (
    <div className="relative h-full flex flex-col">
    {/* The non-modal subtree is `inert`-ed whenever Settings is open. Pairs
        with the `aria-modal="true"` on <SettingsPanel> so focus, pointer,
        and assistive-tech navigation can't leak from the sheet into the
        compact view underneath. The UpdateBanner + Footer below are
        siblings of this subtree so they remain interactive while Settings
        is open (you can still click "Restart now" on the banner). */}
    <div className="flex-1 flex flex-col min-h-0" inert={settingsOpen}>

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
              if (isSavedTab) return;
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
            snippets={snippets}
            focusedIndex={focusedSavedIndex}
            onFocusedIndexChange={setFocusedSavedIndex}
            onActivate={activateSaved}
            query={query}
            listRef={savedListRef}
          />
        ) : (
          <>
            {showClipboardList && (
              <ItemsList
                items={items}
                onActivate={activate}
                onRemove={handleRemove}
                onPinToggle={togglePin}
                onSave={handleSave}
                query={query}
                listRef={listRef}
                onKeyDownCapture={handleClipboardKeyDownCapture}
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
        <span>Click to paste · Shift-click to copy</span>
        <span>Alt Alt to toggle</span>
      </div>

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onThemeChange={onThemeChange}
        />
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
      id={panelId.replace("-panel-", "-")}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={
        "px-2.5 py-1 text-[11px] rounded-md rounded-b-none transition-colors " +
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
