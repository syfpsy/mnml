import { useEffect, useRef, useState } from "react";
import { SearchBar } from "./search-bar";
import { ItemsList } from "./items-list";
import { ExpandIcon, SettingsIcon } from "./icons";
import { SettingsPanel } from "./settings-panel";
import { useItems } from "../hooks/use-items";
import { bridge } from "../lib/bridge";
import type { Item } from "../types";

interface Props {
  onExpand: () => void;
  onThemeChange: (light: boolean) => void;
}

export function CompactView({ onExpand, onThemeChange }: Props) {
  const [query,        setQuery]        = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { items, setItems, refetch } = useItems({ query, limit: 25 });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bridge.setBlurLock(settingsOpen);
    return () => { bridge.setBlurLock(false); };
  }, [settingsOpen]);

  const focusList = () => {
    const grid = listRef.current?.querySelector<HTMLElement>('[role="grid"]');
    grid?.focus();
  };

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
      <div className="mnml-drag px-2.5 pt-2 pb-2 flex items-center gap-2">
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
        <IconBtn label="Expand" onClick={onExpand}>
          <ExpandIcon className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="w-4 h-4" />
        </IconBtn>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto mnml-scroll px-1.5 pb-1.5">
        <ItemsList
          items={items}
          onActivate={activate}
          onRemove={handleRemove}
          onPinToggle={togglePin}
          query={query}
          listRef={listRef}
        />
      </div>

      {/* Footer */}
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
