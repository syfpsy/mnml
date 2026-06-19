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

export function scrubForeignUiohookPrebuilds(uiohookDir, platform = process.platform) {
  const prebuilds = path.join(uiohookDir, "prebuilds");
  if (!fs.existsSync(prebuilds)) return;
  for (const entry of fs.readdirSync(prebuilds, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const keep = platform === "darwin"
      ? entry.name.startsWith("darwin-")
      : platform === "win32"
        ? entry.name.startsWith("win32-")
        : entry.name.startsWith("linux-");
    if (!keep) {
      fs.rmSync(path.join(prebuilds, entry.name), { recursive: true, force: true });
      console.log(`[rebuild] removed foreign uiohook prebuild: ${entry.name}`);
    }
  }
}
