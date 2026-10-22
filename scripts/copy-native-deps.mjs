/**
 * Electron-builder `afterPack` hook — and also usable as a standalone CLI
 * script for testing.
 *
 * Copies the native-module trees into the packaged app's node_modules
 * directory BEFORE the platform target (NSIS) is assembled, so the installer
 * contains the correct binaries.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import builder from 'electron-builder';
import { assertSafeBasename, resolvePathWithinBase } from './lib/safe-path.mjs';
import { findSqliteNode, findUiohookNode } from './lib/native-bindings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SRC_MODS  = resolvePathWithinBase(ROOT, 'node_modules');

const MODULES = [
  'better-sqlite3',
  'uiohook-napi',
  'node-gyp-build',
];

/**
 * Copy only what the TARGET runs: lib/ + its prebuild. Sources and other
 * platforms' prebuilds are ~25 MB of dead weight; a local compile in build/ is
 * host-only, and node-gyp-build loads build/ before prebuilds/, so cross-builds
 * must drop it. `rel` is posix-style relative to the module root (ancestors of
 * a kept file must pass).
 */
function keepFor(mod, platform, arch) {
  const host = platform === process.platform && arch === process.arch;
  const prebuild = `prebuilds/${platform}-${arch}`;
  if (mod === 'better-sqlite3') return (rel) => {
    const top = rel.split('/')[0];
    if (top === 'deps' || top === 'src' || rel === 'binding.gyp') return false;
    if (top === 'prebuilds') return rel === 'prebuilds' || rel === `${prebuild}.node`;
    if (top === 'build') return host && 'build/Release/better_sqlite3.node'.startsWith(rel);
    return true;
  };
  if (mod === 'uiohook-napi') return (rel) => {
    const top = rel.split('/')[0];
    if (top === 'libuiohook' || top === 'src') return false;
    if (top === 'prebuilds') return rel === 'prebuilds' || rel === prebuild || rel.startsWith(`${prebuild}/`);
    if (top === 'build') return host;
    return true;
  };
  return undefined;
}

/**
 * electron-builder `afterPack` entry point.
 * @param {import('electron-builder').AfterPackContext} ctx
 */
export default async function afterPack(ctx) {
  // Universal mac builds need per-arch native binaries from electron-builder itself.
  // This hook copies host node_modules and is only safe for single-arch targets.
  const platform = ctx.electronPlatformName;
  const arch = builder.Arch[ctx.arch];
  if (platform === "darwin" && arch === "universal") {
    console.log("[copy-native-deps] skip — universal mac build uses per-arch rebuild");
    return;
  }

  // macOS resources live inside the bundle — `<appOutDir>/resources` there is a stray folder.
  const resources = ctx.electronPlatformName === 'darwin'
    ? resolvePathWithinBase(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : resolvePathWithinBase(ctx.appOutDir, 'resources');
  const destMods = resolvePathWithinBase(
    resolvePathWithinBase(resources, 'app'),
    'node_modules',
  );
  copyModules(destMods, platform, arch);
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
  copyModules(destMods, 'win32', 'x64');
}

// ── helpers ───────────────────────────────────────────────────────────────────

function copyModules(destBase, platform, arch) {
  fs.mkdirSync(destBase, { recursive: true });

  for (const mod of MODULES) {
    const srcDir  = resolvePathWithinBase(SRC_MODS, mod);
    const destDir = resolvePathWithinBase(destBase, mod);

    if (!fs.existsSync(srcDir)) {
      console.warn(`[copy-native-deps] WARNING: source not found: ${srcDir}`);
      continue;
    }

    fs.rmSync(destDir, { recursive: true, force: true });
    copyDir(srcDir, destDir, keepFor(mod, platform, arch));
    console.log(`[copy-native-deps] ✓  ${mod}`);
  }

  verifyCopiedModules(destBase, platform, arch);
}

function verifyCopiedModules(destBase, platform, arch) {
  const failures = [];
  const sqlite = findSqliteNode(path.join(destBase, "better-sqlite3"), platform, arch);
  const uiohook = findUiohookNode(path.join(destBase, "uiohook-napi"), platform, arch);
  if (!sqlite) failures.push(`better-sqlite3: ${platform}-${arch} binary missing in packaged app`);
  if (!uiohook) failures.push(`uiohook-napi: ${platform}-${arch} binary missing in packaged app`);
  if (failures.length) {
    console.error("[copy-native-deps] packaged native bindings missing:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

function copyDir(from, to, keep, rel = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (keep && !keep(entryRel)) continue;
    try {
      assertSafeBasename(entry.name);
      const s = resolvePathWithinBase(from, entry.name);
      const d = resolvePathWithinBase(to, entry.name);
      if (entry.isDirectory()) copyDir(s, d, keep, entryRel);
      else                     fs.copyFileSync(s, d);
    } catch (err) {
      console.warn(`[copy-native-deps] skip unsafe entry: ${entry.name}`, err);
    }
  }
}
