/**
 * Shared helpers for native .node discovery / platform checks.
 */

import fs from "node:fs";
import path from "node:path";

export function findFile(dir, fileName) {
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

/** better-sqlite3 ≥13 (N-API) loads a local build/Release first, else its shipped prebuild. */
export function findSqliteNode(sqliteDir, platform = process.platform, arch = process.arch) {
  const built = path.join(sqliteDir, "build", "Release", "better_sqlite3.node");
  if (fs.existsSync(built)) return built;
  const prebuilt = path.join(sqliteDir, "prebuilds", `${platform}-${arch}.node`);
  return fs.existsSync(prebuilt) ? prebuilt : null;
}

export function expectedUiohookPrebuildDirs(platform = process.platform, arch = process.arch) {
  if (platform === "darwin") return [`darwin-${arch}`, "darwin-universal"];
  if (platform === "win32") return [`win32-${arch}`];
  if (platform === "linux") return [`linux-${arch}`];
  return [];
}

export function findUiohookNode(uiohookDir, platform = process.platform, arch = process.arch) {
  const prebuilds = path.join(uiohookDir, "prebuilds");
  for (const sub of expectedUiohookPrebuildDirs(platform, arch)) {
    const candidate = path.join(prebuilds, sub, "uiohook-napi.node");
    if (fs.existsSync(candidate)) return candidate;
  }

  const built = findFile(path.join(uiohookDir, "build"), "uiohook-napi.node");
  if (built && !isForeignUiohookPath(built)) return built;

  return null;
}

export function isForeignUiohookPath(nodePath, platform = process.platform) {
  if (platform === "darwin") {
    return /prebuilds[\\/]win32-/.test(nodePath) || /prebuilds[\\/]linux-/.test(nodePath);
  }
  if (platform === "win32") {
    return /prebuilds[\\/]darwin-/.test(nodePath) || /prebuilds[\\/]linux-/.test(nodePath);
  }
  return false;
}
