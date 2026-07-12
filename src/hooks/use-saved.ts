import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import type { SavedSnippet } from "../types";

/**
 * useSaved — fetch the saved-snippets list and re-fetch whenever main
 * broadcasts a `saved-changed` event. Optionally narrows to a query
 * substring (label or content). Cheap — list is small (<100 entries).
 */
export function useSaved(query?: string, enabled = true) {
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);

  const load = useCallback(() => {
    bridge.savedList().then(setSnippets).catch(() => setSnippets([]));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [load, enabled]);

  // Subscribe to "saved-changed" so other windows / IPC paths trigger a
  // refetch (e.g. quick-save from items-list).
  useEffect(() => {
    if (!enabled) return undefined;
    const off = bridge.onSavedChanged(load);
    return off;
  }, [load, enabled]);

  const filtered = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter((s) =>
      s.label.toLowerCase().includes(q) || s.content.toLowerCase().includes(q),
    );
  }, [snippets, query]);

  return { snippets: filtered, refetch: load };
}
