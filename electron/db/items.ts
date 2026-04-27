import { getDb } from "./index.js";

export type ItemType = "text" | "image" | "link";

export interface Item {
  id: number;
  type: ItemType;
  content_text: string | null;
  content_url: string | null;
  image_path: string | null;
  title: string | null;
  hostname: string | null;
  preview: string;
  hash: string;
  byte_size: number;
  created_at: number;
  updated_at: number;
  pinned_at: number | null;
}

// Items are sorted with pinned first (most recent pin first), then by recency.
const ORDER_BY = `ORDER BY (pinned_at IS NULL) ASC, pinned_at DESC, updated_at DESC`;

export interface NewItem {
  type: ItemType;
  content_text?: string | null;
  content_url?: string | null;
  image_path?: string | null;
  title?: string | null;
  hostname?: string | null;
  preview: string;
  hash: string;
  byte_size?: number;
}

export function insertOrTouch(n: NewItem): Item {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .prepare<[string], Item>("SELECT * FROM items WHERE hash = ?")
    .get(n.hash);

  if (existing) {
    db.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(now, existing.id);
    return { ...existing, updated_at: now };
  }

  const result = db
    .prepare(
      `INSERT INTO items
       (type, content_text, content_url, image_path, title, hostname, preview, hash, byte_size, created_at, updated_at)
       VALUES (@type, @content_text, @content_url, @image_path, @title, @hostname, @preview, @hash, @byte_size, @created_at, @updated_at)`,
    )
    .run({
      type: n.type,
      content_text: n.content_text ?? null,
      content_url: n.content_url ?? null,
      image_path: n.image_path ?? null,
      title: n.title ?? null,
      hostname: n.hostname ?? null,
      preview: n.preview,
      hash: n.hash,
      byte_size: n.byte_size ?? 0,
      created_at: now,
      updated_at: now,
    });

  return db
    .prepare<[number | bigint], Item>("SELECT * FROM items WHERE id = ?")
    .get(result.lastInsertRowid)!;
}

export function listRecent(limit = 10, type?: ItemType): Item[] {
  const db = getDb();
  if (type) {
    return db
      .prepare<[ItemType, number], Item>(
        `SELECT * FROM items WHERE type = ? ${ORDER_BY} LIMIT ?`,
      )
      .all(type, limit);
  }
  return db
    .prepare<[number], Item>(`SELECT * FROM items ${ORDER_BY} LIMIT ?`)
    .all(limit);
}

export function setPinned(id: number, pinned: boolean): void {
  const db = getDb();
  db.prepare(
    "UPDATE items SET pinned_at = ?, updated_at = updated_at WHERE id = ?",
  ).run(pinned ? Date.now() : null, id);
}

export function getById(id: number): Item | undefined {
  return getDb()
    .prepare<[number], Item>("SELECT * FROM items WHERE id = ?")
    .get(id);
}

export function deleteById(id: number): void {
  getDb().prepare("DELETE FROM items WHERE id = ?").run(id);
}

export function clearAll(): void {
  getDb().exec("DELETE FROM items");
}

export function updateTitle(id: number, title: string): void {
  getDb()
    .prepare("UPDATE items SET title = ? WHERE id = ?")
    .run(title, id);
}

export function countAll(): number {
  const row = getDb()
    .prepare<[], { c: number }>("SELECT COUNT(*) as c FROM items")
    .get();
  return row?.c ?? 0;
}

export function trimToMax(max: number): { deletedIds: number[] } {
  const db = getDb();
  // Pinned items never get pruned. Apply the limit only to unpinned ones.
  const rows = db
    .prepare<[number], { id: number }>(
      "SELECT id FROM items WHERE pinned_at IS NULL ORDER BY updated_at DESC LIMIT -1 OFFSET ?",
    )
    .all(max);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { deletedIds: [] };
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...ids);
  return { deletedIds: ids };
}

export function allForIndex(): Pick<Item, "id" | "preview" | "content_text" | "title" | "hostname">[] {
  return getDb()
    .prepare<
      [],
      Pick<Item, "id" | "preview" | "content_text" | "title" | "hostname">
    >(
      "SELECT id, preview, content_text, title, hostname FROM items",
    )
    .all();
}
