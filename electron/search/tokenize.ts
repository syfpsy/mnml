/**
 * tokenize.ts — query normalisation utilities for FTS5 search.
 *
 * Earlier versions also exported `trigrams()` / `trigramSim()` for an
 * in-memory fuzzy-match cache. With the items table hard-capped at 200,
 * a SQL LIKE fallback covers the same use case in less code and with no
 * cache to invalidate, so those exports were removed.
 */

export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // strip combining diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // collapse punctuation; keep every script (ı, кириллица, 日本)
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeFtsQuery(q: string): string {
  const tokens = normalize(q).split(" ").filter(Boolean);
  if (!tokens.length) return "";
  return tokens.map((t) => `${t}*`).join(" OR ");
}
