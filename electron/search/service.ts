import { getDb } from "../db/index.js";
import { allForIndex, type Item, type ItemType } from "../db/items.js";
import { escapeFtsQuery, normalize, trigramSim, trigrams } from "./tokenize.js";

// Search abstraction — hybrid FTS5 (keyword) + character trigram similarity (fuzzy/semantic-ish).
// Replaceable later with a real embedding backend: swap the `scoreSemantic` step.

export interface ScoredItem {
  item: Item;
  score: number;
}

interface Cached {
  id: number;
  tri: Set<string>;
}

let cache: Cached[] = [];
let dirty = true;

export function markIndexDirty() {
  dirty = true;
}

function rebuildCache() {
  const rows = allForIndex();
  cache = rows.map((r) => ({
    id: r.id,
    tri: trigrams(
      [r.preview ?? "", r.content_text ?? "", r.title ?? "", r.hostname ?? ""].join(" "),
    ),
  }));
  dirty = false;
}

export function search(
  q: string,
  opts: { limit?: number; type?: ItemType } = {},
): ScoredItem[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const query = normalize(q);

  const ORDER = `ORDER BY (pinned_at IS NULL) ASC, pinned_at DESC, updated_at DESC`;

  if (!query) {
    const rows = opts.type
      ? db
          .prepare<[ItemType, number], Item>(
            `SELECT * FROM items WHERE type = ? ${ORDER} LIMIT ?`,
          )
          .all(opts.type, limit)
      : db
          .prepare<[number], Item>(`SELECT * FROM items ${ORDER} LIMIT ?`)
          .all(limit);
    return rows.map((item) => ({ item, score: 0 }));
  }

  if (dirty) rebuildCache();

  // 1) keyword score via FTS5 BM25
  const fts = escapeFtsQuery(query);
  const ftsRows: { id: number; bm25: number }[] = fts
    ? db
        .prepare<[string], { id: number; bm25: number }>(
          `SELECT items.id AS id, bm25(items_fts) AS bm25
           FROM items_fts
           JOIN items ON items.id = items_fts.rowid
           WHERE items_fts MATCH ?
           LIMIT 500`,
        )
        .all(fts)
    : [];
  const ftsMap = new Map<number, number>();
  for (const r of ftsRows) {
    // bm25 is lower-is-better → flip and clamp
    const norm = 1 / (1 + Math.max(0, r.bm25));
    ftsMap.set(r.id, norm);
  }

  // 2) semantic-ish score via trigram similarity across all items
  const qTri = trigrams(query);
  const semMap = new Map<number, number>();
  for (const c of cache) {
    const s = trigramSim(qTri, c.tri);
    if (s > 0.05) semMap.set(c.id, s);
  }

  // 3) union + blend
  const candidateIds = new Set<number>([...ftsMap.keys(), ...semMap.keys()]);
  if (candidateIds.size === 0) return [];

  const ids = [...candidateIds];
  const placeholders = ids.map(() => "?").join(",");
  const itemsFilter = opts.type ? "AND type = ?" : "";
  const args = opts.type ? [...ids, opts.type] : ids;
  const items = db
    .prepare<unknown[], Item>(
      `SELECT * FROM items WHERE id IN (${placeholders}) ${itemsFilter}`,
    )
    .all(...args);

  const scored: ScoredItem[] = items.map((item) => {
    const kw = ftsMap.get(item.id) ?? 0;
    const sem = semMap.get(item.id) ?? 0;
    const score = 0.6 * kw + 0.4 * sem;
    return { item, score };
  });

  scored.sort((a, b) => {
    // Pinned items always sort first, then by score, then by recency.
    const aPinned = a.item.pinned_at != null ? 1 : 0;
    const bPinned = b.item.pinned_at != null ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    if (b.score !== a.score) return b.score - a.score;
    return b.item.updated_at - a.item.updated_at;
  });

  return scored.slice(0, limit);
}
