/**
 * verify-mac-icon.mjs
 *
 * CI/dev guard: electron-builder rejects icon-512.png smaller than 512×512.
 * Run on any OS before committing icon assets.
 */

import fs from "node:fs";
import path from "node:path";

const iconPath = path.join(process.cwd(), "build", "icon-512.png");
if (!fs.existsSync(iconPath)) {
  console.error("Missing build/icon-512.png — run npm run icons");
  process.exit(1);
}

const buf = fs.readFileSync(iconPath);
if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
  console.error("build/icon-512.png is not a valid PNG");
  process.exit(1);
}

const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
if (w < 512 || h < 512) {
  console.error(`build/icon-512.png is ${w}×${h}; need at least 512×512. Run npm run icons`);
  process.exit(1);
}

console.log(`icon-512.png ok (${w}×${h})`);
