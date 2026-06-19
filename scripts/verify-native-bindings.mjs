/**
 * verify-native-bindings.mjs
 *
 * Fails the build if Electron native addons are missing. Prevents shipping an
 * installer that dies on startup with "Could not locate the bindings file".
 *
 * Run after `npm run rebuild` and before `electron-builder`.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function findFile(dir, fileName) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === fileName) return full;
    }
  }
  return null;
}

/** Prefer platform/arch-matched prebuilds over whatever directory walks first. */
function expectedUiohookPrebuildDirs() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin") {
    return [`darwin-${arch}`, "darwin-universal"];
  }
  if (platform === "win32") {
    return [`win32-${arch}`];
  }
  if (platform === "linux") {
    return [`linux-${arch}`];
  }
  return [];
}

function findUiohookNode(uiohookDir) {
  const prebuilds = path.join(uiohookDir, "prebuilds");
  for (const sub of expectedUiohookPrebuildDirs()) {
    const candidate = path.join(prebuilds, sub, "uiohook-napi.node");
    if (fs.existsSync(candidate)) return candidate;
  }

  // electron-rebuild output (source compile)
  const built = findFile(path.join(uiohookDir, "build"), "uiohook-napi.node")
    ?? findFile(uiohookDir, "uiohook-napi.node");
  if (built) return built;

  // Last resort: any .node (legacy) but warn
  const stack = [uiohookDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith(".node")) return full;
    }
  }
  return null;
}

function verifyMacIcon() {
  if (process.platform !== "darwin") return;
  const iconPath = path.join(root, "build", "icon-512.png");
  if (!fs.existsSync(iconPath)) {
    failures.push("build/icon-512.png missing — run `npm run icons`.");
    return;
  }
  // PNG IHDR width/height at bytes 16–23 (big-endian)
  const buf = fs.readFileSync(iconPath);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    failures.push("build/icon-512.png is not a valid PNG.");
    return;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w < 512 || h < 512) {
    failures.push(
      `build/icon-512.png is ${w}×${h} — electron-builder requires at least 512×512. Run \`npm run icons\`.`,
    );
  }
}

const failures = [];

const sqliteDir = path.join(root, "node_modules", "better-sqlite3");
const sqliteNode = findFile(sqliteDir, "better_sqlite3.node");
if (!sqliteNode) {
  failures.push(
    "better-sqlite3: better_sqlite3.node not found — run `npm run rebuild` (requires build tools on your OS).",
  );
}

const uiohookDir = path.join(root, "node_modules", "uiohook-napi");
const uiohookNode = findUiohookNode(uiohookDir);
if (!uiohookNode) {
  failures.push("uiohook-napi: no .node binary found — run `npm run rebuild`.");
} else {
  const expected = expectedUiohookPrebuildDirs();
  const matched = expected.some((sub) => uiohookNode.includes(`${path.sep}prebuilds${path.sep}${sub}${path.sep}`));
  if (expected.length && uiohookNode.includes(`${path.sep}prebuilds${path.sep}`) && !matched) {
    failures.push(
      `uiohook-napi: found ${uiohookNode} but need a prebuild for ${expected.join(" or ")} — run \`npm run rebuild\` on this machine.`,
    );
  }
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
