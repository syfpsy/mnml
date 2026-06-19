/**
 * Electron-builder `afterPack` hook — and also usable as a standalone CLI
 * script for testing.
 *
 * Copies the five native-module trees into the packaged app's node_modules
 * directory BEFORE the platform target (NSIS) is assembled, so the installer
 * contains the correct binaries.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeBasename, resolvePathWithinBase } from './lib/safe-path.mjs';
import { findFile, findUiohookNode } from './lib/native-bindings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SRC_MODS  = resolvePathWithinBase(ROOT, 'node_modules');

const MODULES = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  'uiohook-napi',
  'node-gyp-build',
];

/**
 * electron-builder `afterPack` entry point.
 * @param {import('electron-builder').AfterPackContext} ctx
 */
export default async function afterPack(ctx) {
  // Universal mac builds need per-arch native binaries from electron-builder itself.
  // This hook copies host node_modules and is only safe for single-arch targets.
  const arch = ctx.arch;
  if (process.platform === "darwin" && arch === "universal") {
    console.log("[copy-native-deps] skip — universal mac build uses per-arch rebuild");
    return;
  }

  const destMods = resolvePathWithinBase(
    resolvePathWithinBase(ctx.appOutDir, 'resources', 'app'),
    'node_modules',
  );
  copyModules(destMods);
}

// ── standalone CLI ────────────────────────────────────────────────────────────
// Invoked directly: `node scripts/copy-native-deps.mjs`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const winUnpacked = resolvePathWithinBase(ROOT, 'release', 'win-unpacked');
  if (!fs.existsSync(winUnpacked)) {
    console.log('[copy-native-deps] win-unpacked not found — skipping');
    process.exit(0);
  }
  const destMods = resolvePathWithinBase(winUnpacked, 'resources', 'app', 'node_modules');
  copyModules(destMods);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function copyModules(destBase) {
  fs.mkdirSync(destBase, { recursive: true });

  for (const mod of MODULES) {
    const srcDir  = resolvePathWithinBase(SRC_MODS, mod);
    const destDir = resolvePathWithinBase(destBase, mod);

    if (!fs.existsSync(srcDir)) {
      console.warn(`[copy-native-deps] WARNING: source not found: ${srcDir}`);
      continue;
    }

    fs.rmSync(destDir, { recursive: true, force: true });
    copyDir(srcDir, destDir);
    console.log(`[copy-native-deps] ✓  ${mod}`);
  }

  verifyCopiedModules(destBase);
}

function verifyCopiedModules(destBase) {
  const failures = [];
  const sqlite = findFile(path.join(destBase, "better-sqlite3"), "better_sqlite3.node");
  const uiohook = findUiohookNode(path.join(destBase, "uiohook-napi"));
  if (!sqlite) failures.push("better-sqlite3: better_sqlite3.node missing in packaged app");
  if (!uiohook) failures.push("uiohook-napi: .node binary missing in packaged app");
  if (failures.length) {
    console.error("[copy-native-deps] packaged native bindings missing:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    try {
      assertSafeBasename(entry.name);
      const s = resolvePathWithinBase(from, entry.name);
      const d = resolvePathWithinBase(to, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else                     fs.copyFileSync(s, d);
    } catch (err) {
      console.warn(`[copy-native-deps] skip unsafe entry: ${entry.name}`, err);
    }
  }
}
