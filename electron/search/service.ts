/**
 * service.ts — search over the `items` table.
 *
 * Stateless: queries SQLite directly on every call. Earlier versions kept an
 * in-memory trigram cache for fuzzy/semantic-style fallback; with the table
 * hard-capped at `maxItems` (default 200) that cache rebuild was wasted work.
 * FTS5's BM25 plus a LIKE fallback for the no-match case covers every
 * realistic query at this dataset size in <5 ms.
 */

import { getDb } from "../db/index.js";
import { type Item, type ItemType } from "../db/items.js";
import { escapeFtsQuery, normalize } from "./tokenize.js";

export interface ScoredItem {
  item: Item;
  score: number;
}

const ORDER = `ORDER BY (pinned_at IS NULL) ASC, pinned_at DESC, updated_at DESC`;

export function search(
  q: string,
  opts: { limit?: number; type?: ItemType } = {},
): ScoredItem[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const query = normalize(q.length > 500 ? q.slice(0, 500) : q);

  // Empty query → most-recent items, pinned first.
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

  // Primary path: FTS5 BM25.
  const fts = escapeFtsQuery(query);
  if (fts) {
    const sql = opts.type
      ? `SELECT items.*, bm25(items_fts) AS _bm25
           FROM items_fts
           JOIN items ON items.id = items_fts.rowid
           WHERE items_fts MATCH ? AND items.type = ?
           ORDER BY (items.pinned_at IS NULL) ASC, items.pinned_at DESC, _bm25 ASC, items.updated_at DESC
           LIMIT ?`
      : `SELECT items.*, bm25(items_fts) AS _bm25
           FROM items_fts
           JOIN items ON items.id = items_fts.rowid
           WHERE items_fts MATCH ?
           ORDER BY (items.pinned_at IS NULL) ASC, items.pinned_at DESC, _bm25 ASC, items.updated_at DESC
           LIMIT ?`;
    const rows = opts.type
      ? db.prepare<[string, ItemType, number], Item & { _bm25: number }>(sql).all(fts, opts.type, limit)
      : db.prepare<[string, number],          Item & { _bm25: number }>(sql).all(fts, limit);
    if (rows.length > 0) {
      return rows.map(({ _bm25, ...item }) => ({
        item: item as Item,
        // bm25 is lower-is-better; flip + clamp into a [0, 1]-ish band.
        score: 1 / (1 + Math.max(0, _bm25)),
      }));
    }
  }

  // Fallback: case-insensitive LIKE over the same columns FTS indexes.
  // SQLite's `LIKE` is case-insensitive by default for ASCII. Cheap at ≤200
  // rows; covers queries FTS rejected (too short / unicode quirks).
  const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const likeSql = opts.type
    ? `SELECT * FROM items
         WHERE type = ?
           AND (preview LIKE ? ESCAPE '\\' OR content_text LIKE ? ESCAPE '\\'
                OR title  LIKE ? ESCAPE '\\' OR hostname    LIKE ? ESCAPE '\\')
         ${ORDER}
         LIMIT ?`
    : `SELECT * FROM items
         WHERE preview LIKE ? ESCAPE '\\' OR content_text LIKE ? ESCAPE '\\'
            OR title  LIKE ? ESCAPE '\\' OR hostname    LIKE ? ESCAPE '\\'
         ${ORDER}
         LIMIT ?`;
  const likeRows = opts.type
    ? db.prepare<[ItemType, string, string, string, string, number], Item>(likeSql)
        .all(opts.type, like, like, like, like, limit)
    : db.prepare<[string, string, string, string, number], Item>(likeSql)
        .all(like, like, like, like, limit);
  return likeRows.map((item) => ({ item, score: 0.5 }));
}
