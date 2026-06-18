/**
 * verify-native-bindings.mjs
 *
 * Fails the build if Electron native addons are missing. Prevents shipping an
 * installer that dies on startup with "Could not locate the bindings file".
 *
 * Run after `npm run rebuild` and before `electron-builder`.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function findFile(dir, fileName) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === fileName) return full;
    }
  }
  return null;
}

function findAnyNode(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith(".node")) return full;
    }
  }
  return null;
}

const failures = [];

const sqliteDir = path.join(root, "node_modules", "better-sqlite3");
const sqliteNode = findFile(sqliteDir, "better_sqlite3.node");
if (!sqliteNode) {
  failures.push(
    "better-sqlite3: better_sqlite3.node not found — run `npm run rebuild` (requires Visual Studio Build Tools on Windows).",
  );
}

const uiohookDir = path.join(root, "node_modules", "uiohook-napi");
const uiohookNode = findAnyNode(uiohookDir);
if (!uiohookNode) {
  failures.push(
    "uiohook-napi: no .node binary found — run `npm run rebuild`.",
  );
}

if (failures.length > 0) {
  console.error("Native binding verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Native bindings ok");
console.log(`  better-sqlite3 → ${sqliteNode}`);
console.log(`  uiohook-napi   → ${uiohookNode}`);
