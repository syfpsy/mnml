import { useEffect, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import type { AppResult } from "../types";

const DEBOUNCE_MS = 120;

interface AppSearchState {
  results: AppResult[];
  isSearching: boolean;
}

const EMPTY_STATE: AppSearchState = {
  results: [],
  isSearching: false,
};

export function useAppSearch(query: string): AppSearchState {
  const [state, setState] = useState<AppSearchState>(EMPTY_STATE);
  const seq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      seq.current += 1;
      setState(EMPTY_STATE);
      return;
    }

    const current = ++seq.current;
    setState({ results: [], isSearching: true });
    const timer = setTimeout(async () => {
      try {
        const response = await bridge.appSearch(trimmed);
        if (current !== seq.current) return;
        setState({ results: response.results, isSearching: false });
      } catch {
        if (current !== seq.current) return;
        setState({ results: [], isSearching: false });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return state;
}
