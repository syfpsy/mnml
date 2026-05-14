import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const userData = app.getPath("userData");
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });

  const imagesDir = path.join(userData, "images");
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  const dbPath = path.join(userData, "mnml.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  migrate(db);
  return db;
}

export function imagesDir(): string {
  return path.join(app.getPath("userData"), "images");
}

function migrate(d: Database.Database) {
  // Phase 1: tables, FTS, triggers — anything that doesn't reference
  // recently-added columns. CREATE TABLE IF NOT EXISTS is a no-op on
  // existing DBs, so we must add new columns separately (phase 2) BEFORE
  // any index that references them.
  d.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('text','image','link')),
      content_text TEXT,
      content_url TEXT,
      image_path TEXT,
      title TEXT,
      hostname TEXT,
      preview TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      byte_size INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pinned_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);

    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      preview, content_text, title, hostname,
      content='items', content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, preview, content_text, title, hostname)
      VALUES (new.id, new.preview, new.content_text, new.title, new.hostname);
    END;

    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, preview, content_text, title, hostname)
      VALUES ('delete', old.id, old.preview, old.content_text, old.title, old.hostname);
    END;

    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, preview, content_text, title, hostname)
      VALUES ('delete', old.id, old.preview, old.content_text, old.title, old.hostname);
      INSERT INTO items_fts(rowid, preview, content_text, title, hostname)
      VALUES (new.id, new.preview, new.content_text, new.title, new.hostname);
    END;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Saved snippets: user-curated reusable text. Independent of the
    -- clipboard history (which is volatile / capped). One row = one snippet.
    CREATE TABLE IF NOT EXISTS saved_snippets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      label      TEXT NOT NULL,           -- short display name shown in the list
      content    TEXT NOT NULL,           -- full text body that gets pasted
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_updated_at ON saved_snippets(updated_at DESC);
  `);

  // Phase 2: idempotent column adds for older DBs that pre-date this column.
  ensureColumn(d, "items", "pinned_at", "INTEGER");

  // Phase 3: indexes that reference newly-added columns.
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_pinned_at ON items(pinned_at);
  `);

  // Phase 4: drop the deprecated PC-search index tables. The bulk file
  // crawler and chokidar watcher have been removed; these tables would
  // otherwise sit around taking disk space (potentially hundreds of MB on
  // machines that ran the v0.2.16–v0.2.22 indexer).
  d.exec(`
    DROP TRIGGER IF EXISTS pc_entries_ai;
    DROP TRIGGER IF EXISTS pc_entries_ad;
    DROP TRIGGER IF EXISTS pc_entries_au;
    DROP TABLE   IF EXISTS pc_entries_fts;
    DROP TABLE   IF EXISTS pc_entries;
    DROP TABLE   IF EXISTS pc_index_meta;
  `);
}

function ensureColumn(
  d: Database.Database,
  table: string,
  col: string,
  type: string,
) {
  const cols = d
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all();
  if (cols.some((c) => c.name === col)) return;
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
