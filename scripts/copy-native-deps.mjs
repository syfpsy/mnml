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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const SRC_MODS  = path.join(ROOT, 'node_modules');

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
  // With asar:false the app content lives at <appOutDir>/resources/app/
  const destMods = path.join(ctx.appOutDir, 'resources', 'app', 'node_modules');
  copyModules(destMods);
}

// ── standalone CLI ────────────────────────────────────────────────────────────
// Invoked directly: `node scripts/copy-native-deps.mjs`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const winUnpacked = path.join(ROOT, 'release', 'win-unpacked');
  if (!fs.existsSync(winUnpacked)) {
    console.log('[copy-native-deps] win-unpacked not found — skipping');
    process.exit(0);
  }
  const destMods = path.join(winUnpacked, 'resources', 'app', 'node_modules');
  copyModules(destMods);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function copyModules(destBase) {
  fs.mkdirSync(destBase, { recursive: true });

  for (const mod of MODULES) {
    const srcDir  = path.join(SRC_MODS, mod);
    const destDir = path.join(destBase, mod);

    if (!fs.existsSync(srcDir)) {
      console.warn(`[copy-native-deps] WARNING: source not found: ${srcDir}`);
      continue;
    }

    fs.rmSync(destDir, { recursive: true, force: true });
    copyDir(srcDir, destDir);
    console.log(`[copy-native-deps] ✓  ${mod}`);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to,   entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else                     fs.copyFileSync(s, d);
  }
}
