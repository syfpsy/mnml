import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../lib/bridge";
import type { SavedSnippet } from "../types";

/**
 * useSaved — fetch the saved-snippets list and re-fetch whenever main
 * broadcasts a `saved-changed` event. Optionally narrows to a query
 * substring (label or content). Cheap — list is small (<100 entries).
 */
export function useSaved(query?: string) {
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);

  const load = useCallback(() => {
    bridge.savedList().then(setSnippets).catch(() => setSnippets([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Subscribe to "saved-changed" so other windows / IPC paths trigger a
  // refetch (e.g. quick-save from items-list).
  useEffect(() => {
    const off = bridge.onSavedChanged(load);
    return off;
  }, [load]);

  const filtered = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter((s) =>
      s.label.toLowerCase().includes(q) || s.content.toLowerCase().includes(q),
    );
  }, [snippets, query]);

  return { snippets: filtered, all: snippets, refetch: load };
}
