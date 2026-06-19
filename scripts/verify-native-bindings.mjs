/**
 * verify-native-bindings.mjs
 *
 * Fails the build if Electron native addons are missing. Prevents shipping an
 * installer that dies on startup with "Could not locate the bindings file".
 */

import fs from "node:fs";
import path from "node:path";
import {
  findFile,
  findUiohookNode,
  isForeignUiohookPath,
} from "./lib/native-bindings.mjs";

const root = process.cwd();
const failures = [];

function verifyMacIcon() {
  if (process.platform !== "darwin") return;
  const iconPath = path.join(root, "build", "icon-512.png");
  if (!fs.existsSync(iconPath)) {
    failures.push("build/icon-512.png missing — run `npm run icons`.");
    return;
  }
  const buf = fs.readFileSync(iconPath);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    failures.push("build/icon-512.png is not a valid PNG.");
    return;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w < 512 || h < 512) {
    failures.push(
      `build/icon-512.png is ${w}×${h} — need 512×512. Run \`npm run icons\`.`,
    );
  }
}

const sqliteDir = path.join(root, "node_modules", "better-sqlite3");
const sqliteNode = findFile(sqliteDir, "better_sqlite3.node");
if (!sqliteNode) {
  failures.push(
    "better-sqlite3: better_sqlite3.node not found — run `npm run rebuild`.",
  );
}

const uiohookDir = path.join(root, "node_modules", "uiohook-napi");
const uiohookNode = findUiohookNode(uiohookDir);
if (!uiohookNode) {
  failures.push(
    "uiohook-napi: no .node binary for this platform — run `rm -rf node_modules && npm ci`.",
  );
} else if (isForeignUiohookPath(uiohookNode)) {
  failures.push(
    `uiohook-napi: wrong-platform binary (${uiohookNode}) — run \`rm -rf node_modules && npm ci\` on this Mac, never copy node_modules from Windows.`,
  );
}

verifyMacIcon();

if (failures.length > 0) {
  console.error("Native binding verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Native bindings ok");
console.log(`  better-sqlite3 → ${sqliteNode}`);
console.log(`  uiohook-napi   → ${uiohookNode}`);
