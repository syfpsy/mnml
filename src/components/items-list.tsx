import { useEffect, useRef, useState } from "react";
import { ListView } from "@heroui-pro/react/list-view";
import type { Key } from "react-aria-components";
import { bridge } from "../lib/bridge";
import { timeAgo, splitHighlight } from "../lib/format";
import type { Item } from "../types";
import {
  ImageIcon,
  LinkIcon,
  PinFilledIcon,
  PinIcon,
  TextIcon,
  TrashIcon,
} from "./icons";

interface Props {
  items: Item[];
  onActivate: (item: Item) => void;
  onRemove: (id: number) => void;
  onPinToggle: (item: Item) => void;
  query: string;
  emptyHint?: string;
  listRef?: React.RefObject<HTMLDivElement | null>;
}

export function ItemsList({
  items, onActivate, onRemove, onPinToggle,
  query, emptyHint, listRef,
}: Props) {
  return (
    <div ref={listRef} className="mnml-no-drag">
      <ListView
        aria-label="Clipboard history"
        items={items}
        selectionMode="none"
        variant="secondary"
        onAction={(key: Key) => {
          const item = items.find(i => String(i.id) === String(key));
          if (item) onActivate(item);
        }}
        renderEmptyState={() => (
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[13px]" style={{ color: "var(--t2)" }}>
              {query ? "No matches" : "Nothing here yet"}
            </p>
            <p className="text-[12px]" style={{ color: "var(--t3)" }}>
              {query ? "Try different words." : emptyHint ?? "Copy any text, link, or image."}
            </p>
          </div>
        )}
      >
        {(item: Item) => {
          const isPinned = item.pinned_at != null;
          const tint = TYPE_TINT[item.type];
          return (
            <ListView.Item
              id={String(item.id)}
              textValue={item.preview ?? "image"}
              className="group"
              style={{
                "--item-tint":       tint.rowBg,
                "--item-tint-hover": tint.rowHover,
              } as React.CSSProperties}
            >
              <ListView.ItemContent>
                <TypeIcon item={item} />
                <div className="min-w-0 flex flex-col gap-0.5">
                  <ListView.Title
                    className={item.type === "text" ? "!whitespace-normal line-clamp-2" : ""}
                  >
                    <ItemTitle item={item} query={query} />
                  </ListView.Title>
                  <ItemDescLine item={item} />
                </div>
              </ListView.ItemContent>

              <ListView.ItemAction>
                <div className="flex items-center gap-0.5">
                  <span className="text-[11px] tabular-nums mr-1" style={{ color: "var(--t3)" }}>
                    {timeAgo(item.updated_at)}
                  </span>

                  <ActionBtn
                    label={isPinned ? "Unpin" : "Pin"}
                    onClick={() => onPinToggle(item)}
                    alwaysVisible={isPinned}
                    color={isPinned ? "#f59e0b" : undefined}
                  >
                    {isPinned
                      ? <PinFilledIcon className="w-3.5 h-3.5" />
                      : <PinIcon      className="w-3.5 h-3.5" />}
                  </ActionBtn>

                  <DeleteBtn onRemove={() => onRemove(item.id)} />
                </div>
              </ListView.ItemAction>
            </ListView.Item>
          );
        }}
      </ListView>
    </div>
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
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={[
        "p-1 rounded-md transition-colors",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100",
      ].join(" ")}
      style={{ color: color ?? "var(--t2)" }}
      onMouseEnter={(e) => !color && ((e.currentTarget as HTMLElement).style.color = "var(--t1)")}
      onMouseLeave={(e) => !color && ((e.currentTarget as HTMLElement).style.color = color ?? "var(--t2)")}
    >
      {children}
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
        "p-1 rounded-md transition-colors",
        armed ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
      ].join(" ")}
      style={{ color: armed ? "#ef4444" : "var(--t2)" }}
      onMouseEnter={(e) => { if (!armed) (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
      onMouseLeave={(e) => { if (!armed) (e.currentTarget as HTMLElement).style.color = "var(--t2)"; }}
    >
      <TrashIcon className="w-3.5 h-3.5" />
    </button>
  );
}

/* ── Type icon ────────────────────────────────────────────────────────────── */

/**
 * Per-category colour tokens.
 *   bg/icon   → icon container background + stroke
 *   rowBg     → whole-row wash (very subtle, ~4 % opacity)
 *   rowHover  → whole-row wash on hover/focus (~8 %)
 *
 * Add new types here; the rest of the component picks them up automatically.
 */
const TYPE_TINT = {
  text:  { bg: "rgba(96,165,250,0.10)",  icon: "#60a5fa", rowBg: "rgba(96,165,250,0.04)",  rowHover: "rgba(96,165,250,0.08)"  },
  link:  { bg: "rgba(167,139,250,0.10)", icon: "#a78bfa", rowBg: "rgba(167,139,250,0.04)", rowHover: "rgba(167,139,250,0.08)" },
  image: { bg: "rgba(251,113,133,0.10)", icon: "#fb7185", rowBg: "rgba(251,113,133,0.04)", rowHover: "rgba(251,113,133,0.08)" },
} as const;

function TypeIcon({ item }: { item: Item }) {
  if (item.type === "image") return <ImageThumb item={item} />;
  if (item.type === "link")  return <FaviconOrIcon item={item} />;
  const { bg, icon } = TYPE_TINT.text;
  return (
    <div
      className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
      style={{ background: bg, color: icon }}
    >
      <TextIcon className="w-3 h-3" />
    </div>
  );
}

function ImageThumb({ item }: { item: Item }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    bridge.getImageDataUrl(item.id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [item.id]);

  const { bg, icon } = TYPE_TINT.image;
  return (
    <div
      className="w-6 h-6 shrink-0 rounded-md overflow-hidden"
      style={{ background: bg }}
    >
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center" style={{ color: icon }}>
            <ImageIcon className="w-3 h-3" />
          </div>}
    </div>
  );
}

function FaviconOrIcon({ item }: { item: Item }) {
  const { bg, icon } = TYPE_TINT.link;
  const [favOk, setFavOk] = useState(true);
  const faviconUrl = item.hostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.hostname)}&sz=16`
    : null;

  return (
    <div
      className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center overflow-hidden"
      style={{ background: bg, color: icon }}
    >
      {faviconUrl && favOk ? (
        <img
          src={faviconUrl}
          alt=""
          className="w-3.5 h-3.5 object-contain"
          onError={() => setFavOk(false)}
        />
      ) : (
        <LinkIcon className="w-3 h-3" />
      )}
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
              style={{ background: "rgba(251,191,36,0.2)", color: "var(--t1)" }}
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
