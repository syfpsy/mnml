/**
 * write-gh-release-notes.mjs
 *
 * Writes UTF-8 release notes for `gh release --notes-file`.
 * Usage: node scripts/write-gh-release-notes.mjs 0.3.0 > notes.md
 *    or: node scripts/write-gh-release-notes.mjs 0.3.0 --out release-notes.md
 */

import fs from "node:fs";
import { execSync } from "node:child_process";

const version = process.argv[2];
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;

if (!version) {
  console.error("Usage: node scripts/write-gh-release-notes.mjs <version> [--out file.md]");
  process.exit(1);
}

const body = execSync(`node scripts/extract-changelog.mjs ${version}`, { encoding: "utf8" });
if (outPath) fs.writeFileSync(outPath, body, "utf8");
else process.stdout.write(body);
