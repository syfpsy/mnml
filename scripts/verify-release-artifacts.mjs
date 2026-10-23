/**
 * verify-release-artifacts.mjs
 *
 * Ensures release/ contains the files we expect before gh release upload.
 * Usage:
 *   node scripts/verify-release-artifacts.mjs win
 *   node scripts/verify-release-artifacts.mjs mac
 *   node scripts/verify-release-artifacts.mjs all
 */

import crypto from "node:crypto";
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

/**
 * electron-updater rejects a download whose sha512 or size differs from the
 * yml, and every client then stays on the old version. Catch a rebuilt or
 * swapped installer (or another build's yml) before anything is uploaded.
 */
function checkUpdateYml(name) {
  const yml = fs.readFileSync(path.join(releaseDir, name), "utf8");
  const pkgVersion = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  const errors = [];
  const version = /^version:\s*(\S+)/m.exec(yml)?.[1];
  if (version !== pkgVersion) errors.push(`${name}: version ${version} but package.json is ${pkgVersion}`);
  const entries = [...yml.matchAll(/- url: (\S+)\s+sha512: (\S+)\s+size: (\d+)/g)];
  if (entries.length === 0) errors.push(`${name}: no files listed`);
  for (const [, url, sha512, size] of entries) {
    const file = path.join(releaseDir, url);
    if (!fs.existsSync(file)) { errors.push(`${name}: lists ${url}, which is missing`); continue; }
    const buf = fs.readFileSync(file);
    if (buf.length !== Number(size)) errors.push(`${name}: ${url} is ${buf.length} bytes, yml says ${size}`);
    else if (crypto.createHash("sha512").update(buf).digest("base64") !== sha512) errors.push(`${name}: ${url} sha512 differs from the yml`);
    else console.log(`  ok  ${name} matches ${url}`);
  }
  if (errors.length) {
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
}

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
  checkUpdateYml("latest.yml");
}
if (platform === "mac" || platform === "all") {
  console.log("macOS:");
  check(MAC);
  checkUpdateYml("latest-mac.yml");
}
console.log("Release artifacts ok");
