/**
 * saved.ts — CRUD for the `saved_snippets` table.
 *
 * Snippets are user-curated reusable text blobs (a colour, a regex, an
 * email signature). Independent of the volatile clipboard history.
 * Searched in-memory by the renderer (small dataset), so no FTS index.
 */

import { getDb } from "./index.js";

export interface SavedSnippet {
  id:         number;
  label:      string;
  content:    string;
  created_at: number;
  updated_at: number;
}

interface SavedRow {
  id:         number;
  label:      string;
  content:    string;
  created_at: number;
  updated_at: number;
}

/**
 * Defensive cap: even though the realistic snippet count is small (tens to
 * low hundreds), unbounded select-all means a malicious or runaway insert
 * loop could load megabytes of content into the renderer. Hard limit at
 * 500 most-recently-touched. Bumping this is safe; never remove the LIMIT.
 */
const LIST_SAVED_CAP = 500;
const MAX_SNIPPET_LABEL_LEN = 200;
const MAX_SNIPPET_CONTENT_LEN = 64 * 1024;

function clampSnippetField(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

export function listSaved(): SavedSnippet[] {
  return getDb()
    .prepare<[number], SavedRow>(
      `SELECT id, label, content, created_at, updated_at
       FROM saved_snippets
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(LIST_SAVED_CAP);
}

export function getSavedById(id: number): SavedSnippet | null {
  const row = getDb()
    .prepare<[number], SavedRow>(
      "SELECT id, label, content, created_at, updated_at FROM saved_snippets WHERE id = ?",
    )
    .get(id);
  return row ?? null;
}

export function addSaved(label: string, content: string): SavedSnippet {
  const now = Date.now();
  const trimmedLabel   = clampSnippetField(label.trim()   || defaultLabel(content), MAX_SNIPPET_LABEL_LEN);
  const trimmedContent = clampSnippetField(content, MAX_SNIPPET_CONTENT_LEN);
  const result = getDb()
    .prepare(
      "INSERT INTO saved_snippets(label, content, created_at, updated_at) VALUES(?, ?, ?, ?)",
    )
    .run(trimmedLabel, trimmedContent, now, now);
  return {
    id:         Number(result.lastInsertRowid),
    label:      trimmedLabel,
    content:    trimmedContent,
    created_at: now,
    updated_at: now,
  };
}

export function updateSaved(id: number, label: string, content: string): void {
  const now = Date.now();
  const trimmedLabel = clampSnippetField(label.trim() || defaultLabel(content), MAX_SNIPPET_LABEL_LEN);
  const trimmedContent = clampSnippetField(content, MAX_SNIPPET_CONTENT_LEN);
  getDb()
    .prepare(
      "UPDATE saved_snippets SET label = ?, content = ?, updated_at = ? WHERE id = ?",
    )
    .run(trimmedLabel, trimmedContent, now, id);
}

export function deleteSaved(id: number): void {
  getDb().prepare("DELETE FROM saved_snippets WHERE id = ?").run(id);
}

/**
 * Mark a snippet as recently-used by bumping its `updated_at`. Called when
 * the user activates a snippet so it floats to the top of the list.
 */
export function touchSaved(id: number): void {
  getDb()
    .prepare("UPDATE saved_snippets SET updated_at = ? WHERE id = ?")
    .run(Date.now(), id);
}

/**
 * Compute a short label when the user doesn't provide one — first non-empty
 * line of the content, capped at 60 chars.
 */
function defaultLabel(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : (firstLine || "Snippet");
}
