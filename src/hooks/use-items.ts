import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import type { Item, ItemType } from "../types";

interface Options {
  query: string;
  type?: ItemType;
  limit: number;
}

// Fetches items (either recent or search results), subscribes to new-item events,
// and debounces search queries so typing stays smooth.
export function useItems({ query, type, limit }: Options) {
  const [items, setItems] = useState<Item[]>([]);
  const [rev, setRev] = useState(0);
  const seq = useRef(0);

  // Call refetch() to force a re-query without changing query/type/limit.
  const refetch = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    const current = ++seq.current;

    const run = async () => {
      const results = query.trim()
        ? await bridge.search(query.trim(), type, limit)
        : await bridge.listRecent(limit, type);
      if (current !== seq.current) return;
      setItems(results);
    };

    const timer = setTimeout(run, query.trim() ? 110 : 0);
    return () => clearTimeout(timer);
  }, [query, type, limit, rev]);

  useEffect(() => {
    const off = bridge.onItemAdded((item) => {
      // only auto-prepend on the "recent" view with no type filter or matching type
      if (query.trim()) return;
      if (type && item.type !== type) return;
      setItems((prev) => {
        const without = prev.filter((p) => p.id !== item.id);
        return [item, ...without].slice(0, limit);
      });
    });
    return off;
  }, [query, type, limit]);

  // Patch in-place when a field like `title` is enriched asynchronously (e.g. link title fetch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => bridge.onItemUpdated((updated) => {
    setItems((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    );
  }), []);

  return { items, setItems, refetch };
}
