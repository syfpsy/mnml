/**
 * extract-changelog.mjs
 *
 * Prints the CHANGELOG section for a version (for gh release --notes-file).
 * Usage: node scripts/extract-changelog.mjs 0.3.0
 */

import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/extract-changelog.mjs <version>");
  process.exit(1);
}

const changelog = fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
const header = `## v${version}`;
const start = changelog.indexOf(header);
if (start < 0) {
  console.log(`Release ${version}. See CHANGELOG.md.`);
  process.exit(0);
}

const rest = changelog.slice(start + header.length);
const next = rest.search(/\n## v\d+\.\d+\.\d+/);
const body = (next >= 0 ? rest.slice(0, next) : rest).trim();
console.log(`# v${version}\n\n${body}`);
