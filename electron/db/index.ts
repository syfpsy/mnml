import Database from "better-sqlite3";
import fs from "node:fs";
import { getDataDir, isUsingDefaultDataDir } from "./data-dir.js";
import { resolvePathWithinBase } from "../utils/safe-path.js";

let db: Database.Database | null = null;

/**
 * Schema migration runs once per process. After an idle-close the on-disk
 * file is already migrated, so a reopen within the same process skips it.
 * A `dataDir` change always goes through an app restart (see ipc.ts), so
 * this flag is never stale across two different DB files.
 */
let migrated = false;

/**
 * Idle-close timer.
 *
 * mnml is an always-on tray app, but its DB usage is bursty — a clipboard
 * capture here, a summon-and-search there, idle the rest of the time.
 * Holding the SQLite file open continuously blocks a cloud-sync service
 * (Dropbox / OneDrive / iCloud) from replacing `mnml.sqlite` when the OTHER
 * device's copy syncs down: the open handle forces a `.conflict` file
 * instead of a clean overwrite, and the running instance never sees the
 * remote changes.
 *
 * Fix: drop the connection after a short idle window. The file goes "free",
 * the pending sync lands, and the next `getDb()` reopens fresh. Reopening
 * costs ~1 ms — imperceptible for a bursty workload.
 */
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_CLOSE_MS = 5_000;

function armIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    closeDb();
  }, IDLE_CLOSE_MS);
}

export function getDb(): Database.Database {
  // Every access pushes the idle-close deadline out. A burst of activity
  // keeps the connection open; a quiet stretch lets it close.
  armIdleClose();
  if (db) return db;

  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const imgDir = resolvePathWithinBase(dataDir, "images");
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const dbPath = resolvePathWithinBase(dataDir, "mnml.sqlite");
  db = new Database(dbPath);

  // Journal mode depends on whether the data lives in a synced folder:
  //   · Default %APPDATA% location → WAL. Faster; never synced, so the
  //     `-wal` / `-shm` sidecars are harmless.
  //   · Custom (likely synced) location → DELETE, the classic rollback
  //     journal. After every commit the single `mnml.sqlite` file is
  //     self-consistent, so a cloud service can sync just that one file
  //     safely. WAL's sidecars would otherwise sync out of step and
  //     corrupt the DB.
  db.pragma(isUsingDefaultDataDir() ? "journal_mode = WAL" : "journal_mode = DELETE");
  db.pragma("synchronous = NORMAL");

  if (!migrated) {
    migrate(db);
    migrated = true;
  }
  return db;
}

export function imagesDir(): string {
  return resolvePathWithinBase(getDataDir(), "images");
}

/**
 * Cleanly close the SQLite connection (checkpoint + handle release). Called
 * by the idle timer, before swapping `dataDir`, and on app quit. After this
 * the next `getDb()` reopens at whatever path `getDataDir()` resolves to.
 *
 * Safe to call when no connection is open — it's a no-op.
 */
export function closeDb(): void {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!db) return;
  try {
    // No-op in DELETE journal mode; in WAL mode it merges the `-wal` back
    // into the main file so the on-disk `.sqlite` is fully consistent
    // before the handle is released.
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
  } catch {
    /* swallow — we're about to throw the handle away anyway */
  }
  db = null;
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
