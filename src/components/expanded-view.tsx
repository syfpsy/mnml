import { useEffect, useRef, useState } from "react";
import { SearchBar } from "./search-bar";
import { ItemsList } from "./items-list";
import { SettingsPanel } from "./settings-panel";
import { CompactIcon, SettingsIcon } from "./icons";
import { useItems } from "../hooks/use-items";
import { bridge } from "../lib/bridge";
import type { Item, ItemType, TabKey } from "../types";

interface Props {
  onCollapse: () => void;
  onThemeChange: (light: boolean) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all",   label: "All"    },
  { key: "text",  label: "Text"   },
  { key: "link",  label: "Links"  },
  { key: "image", label: "Images" },
];

const TYPE_BY_TAB: Record<TabKey, ItemType | undefined> = {
  all: undefined, text: "text", link: "link", image: "image",
};

export function ExpandedView({ onCollapse, onThemeChange }: Props) {
  const [query,        setQuery]        = useState("");
  const [tab,          setTab]          = useState<TabKey>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const { items, setItems, refetch } = useItems({ query, type: TYPE_BY_TAB[tab], limit: 100 });

  const focusList = () => {
    const grid = listRef.current?.querySelector<HTMLElement>('[role="grid"]');
    grid?.focus();
  };

  useEffect(() => {
    bridge.setBlurLock(settingsOpen);
    return () => { bridge.setBlurLock(false); };
  }, [settingsOpen]);

  const activate = async (item: Item) => { await bridge.restore(item.id, true); await bridge.hide(); };
  const copyOnly = async (item: Item) => { await bridge.restore(item.id); };
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

  return (
    <div className="relative flex flex-col h-full">

      {/* Header */}
      <div
        className="mnml-drag px-2.5 pt-2 pb-2 flex items-center gap-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex-1">
          <SearchBar
            value={query}
            onChange={setQuery}
            inputRef={inputRef}
            onArrowDown={focusList}
            onArrowUp={() => {}}
            onHome={() => {}}
            onEnd={() => {}}
            onEnter={(e) => {
              const item = items[0];
              if (!item) return;
              if (e.shiftKey) copyOnly(item); else activate(item);
            }}
            onDelete={() => { const item = items[0]; if (item) handleRemove(item.id); }}
            onEscape={() => bridge.hide()}
          />
        </div>
        <IconBtn label="Compact view" onClick={onCollapse}>
          <CompactIcon className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="w-4 h-4" />
        </IconBtn>
      </div>

      {/* Tabs */}
      <div
        className="mnml-no-drag flex items-center gap-1 px-2.5 pt-1.5 pb-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map((t) => (
          <TabBtn
            key={t.key}
            label={t.label}
            active={tab === t.key}
            onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto mnml-scroll px-1.5 py-1.5">
        <ItemsList
          items={items}
          onActivate={activate}
          onRemove={handleRemove}
          onPinToggle={togglePin}
          query={query}
          listRef={listRef}
          emptyHint={
            tab === "image" ? "No images captured yet." :
            tab === "link"  ? "No links captured yet."  :
            tab === "text"  ? "No text captured yet."   :
            "Copy anything — text, links, or images."
          }
        />
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

/* ── Shared sub-components ────────────────────────────────────────────────── */

function IconBtn({ children, label, onClick }: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="mnml-no-drag shrink-0 w-8 h-8 flex items-center justify-center rounded-md transition-colors"
      style={{ color: "var(--t2)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--t1)";
        (e.currentTarget as HTMLElement).style.background = "var(--item-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--t2)";
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-[12px] rounded-md rounded-b-none transition-colors relative"
      style={{
        color:        active ? "var(--t1)"          : "var(--t2)",
        background:   active ? "var(--item-active)" : "transparent",
        borderBottom: active ? "2px solid var(--t2)" : "2px solid transparent",
        marginBottom: "-1px",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--t1)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--t2)";
      }}
    >
      {label}
    </button>
  );
}
