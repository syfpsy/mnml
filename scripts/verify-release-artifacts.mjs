/**
 * verify-release-artifacts.mjs
 *
 * Ensures release/ contains the files we expect before gh release upload.
 * Usage:
 *   node scripts/verify-release-artifacts.mjs win
 *   node scripts/verify-release-artifacts.mjs mac
 *   node scripts/verify-release-artifacts.mjs all
 */

import fs from "node:fs";
import path from "node:path";

const platform = process.argv[2] ?? "all";
const releaseDir = path.join(process.cwd(), "release");

const WIN = [
  "mnml-setup.exe",
  "latest.yml",
  "mnml-setup.exe.blockmap",
];

const MAC = [
  "mnml-mac.zip",
  "mnml-mac.dmg",
  "latest-mac.yml",
  "mnml-mac.zip.blockmap",
];

function check(files) {
  const missing = files.filter((f) => !fs.existsSync(path.join(releaseDir, f)));
  if (missing.length) {
    console.error("Missing release artifacts:");
    for (const f of missing) console.error(`  - release/${f}`);
    process.exit(1);
  }
  for (const f of files) {
    const stat = fs.statSync(path.join(releaseDir, f));
    console.log(`  ok  release/${f} (${stat.size} bytes)`);
  }
}

console.log(`Verifying ${platform} release artifacts in release/`);
if (platform === "win" || platform === "all") {
  console.log("Windows:");
  check(WIN);
}
if (platform === "mac" || platform === "all") {
  console.log("macOS:");
  check(MAC);
}
console.log("Release artifacts ok");
