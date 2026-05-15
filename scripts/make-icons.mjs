#!/usr/bin/env node
/**
 * scripts/make-icons.mjs
 *
 * Rasterises `build/icon.svg` into:
 *   - `build/icon-NN.png` at 16, 24, 32, 48, 64, 128, 256 (intermediate)
 *   - `build/icon.ico`  — Windows multi-resolution icon, consumed by
 *                         electron-builder via `package.json:build.win.icon`
 *                         and by BrowserWindow's `icon:` option.
 *   - `build/tray.png` (16) + `build/tray@2x.png` (32) — used by the
 *                         tray code in `electron/main.ts`.
 *
 * Run via `npm run icons` whenever `build/icon.svg` changes. The generated
 * artefacts are committed (they're tiny — ~100 KB total) so the regular
 * `npm run build` doesn't need to re-rasterise.
 *
 * Implementation:
 *   - PNG rendering: spawn `npx --yes sharp-cli` (same toolchain we use for
 *     the OG card; no new project dependencies).
 *   - ICO assembly: hand-written. The ICO container is just a 6-byte header
 *     + N × 16-byte directory entries + concatenated PNG payloads. ~30 lines
 *     of buffer math; far simpler than pulling in a dedicated dep.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const BUILD     = path.join(ROOT, "build");
const SVG       = path.join(BUILD, "icon.svg");
const SIZES     = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(SVG)) {
  console.error(`Missing master SVG: ${SVG}`);
  process.exit(1);
}

/**
 * Render the master SVG to a PNG at a given square size via sharp-cli.
 * sharp-cli's CLI wants an input file + output directory + a filename;
 * we pass `--filename` to control the exact name.
 */
function renderPng(size) {
  // sharp-cli writes the output using the input filename + the requested
  // format extension. For our `icon.svg`, that's always `icon.png`. We
  // rename to `icon-NN.png` after each invocation to keep a per-size copy.
  const intermediate = path.join(BUILD, "icon.png");
  const outName      = `icon-${size}.png`;
  const finalPath    = path.join(BUILD, outName);

  const r = spawnSync(
    "npx",
    [
      "--yes", "sharp-cli",
      "-i", SVG,
      "-o", BUILD,
      "-f", "png",
      "resize", String(size), String(size),
    ],
    { stdio: "inherit", shell: true },
  );
  if (r.status !== 0) {
    throw new Error(`sharp-cli failed for size ${size}`);
  }

  // Move the just-rendered icon.png into its size-specific name. fs.renameSync
  // is atomic on the same filesystem, so the next iteration's render can
  // safely overwrite the intermediate `icon.png` again.
  if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
  fs.renameSync(intermediate, finalPath);
  return finalPath;
}

/**
 * Build a Windows ICO container from a list of PNG buffers.
 *
 * ICO layout:
 *   - ICONDIR (6 bytes):    reserved(2)=0, type(2)=1, count(2)=N
 *   - ICONDIRENTRY × N:     width(1), height(1), colorCount(1)=0,
 *                           reserved(1)=0, planes(2)=1, bitCount(2)=32,
 *                           bytesInRes(4), imageOffset(4)
 *   - PNG payloads          (each entry's offset points here)
 *
 * For width/height fields, the spec encodes 256 as 0.
 */
function buildIco(entries) {
  const headerSize = 6 + entries.length * 16;
  const header     = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: 1 = ICO
  header.writeUInt16LE(entries.length, 4); // image count

  const directory = Buffer.alloc(entries.length * 16);
  let offset = headerSize;
  for (let i = 0; i < entries.length; i++) {
    const { size, png } = entries[i];
    const o = i * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, o);     // width
    directory.writeUInt8(size >= 256 ? 0 : size, o + 1); // height
    directory.writeUInt8(0, o + 2);                       // color count (palette)
    directory.writeUInt8(0, o + 3);                       // reserved
    directory.writeUInt16LE(1, o + 4);                    // color planes
    directory.writeUInt16LE(32, o + 6);                   // bits per pixel
    directory.writeUInt32LE(png.length, o + 8);           // bytes in payload
    directory.writeUInt32LE(offset, o + 12);              // payload offset
    offset += png.length;
  }
  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

// ── Run ────────────────────────────────────────────────────────────────────

const entries = [];
for (const size of SIZES) {
  const pngPath = renderPng(size);
  entries.push({ size, png: fs.readFileSync(pngPath) });
  console.log(`  → icon-${size}.png  (${fs.statSync(pngPath).size} B)`);
}

const ico = buildIco(entries);
const icoPath = path.join(BUILD, "icon.ico");
fs.writeFileSync(icoPath, ico);
console.log(`✓ icon.ico              (${ico.length} B, ${SIZES.length} sizes)`);

// Tray icons: 16 + 32 for retina. Just copy the already-rendered PNGs.
fs.copyFileSync(path.join(BUILD, "icon-16.png"), path.join(BUILD, "tray.png"));
fs.copyFileSync(path.join(BUILD, "icon-32.png"), path.join(BUILD, "tray@2x.png"));
console.log(`✓ tray.png + tray@2x.png (16 + 32)`);
