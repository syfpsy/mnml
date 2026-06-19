#!/usr/bin/env node
/**
 * Rebuild native addons for the current OS + CPU.
 * Strips uiohook prebuilds from other platforms (e.g. win32 copied onto a Mac).
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  findUiohookNode,
  isForeignUiohookPath,
  scrubForeignUiohookPrebuilds,
} from "./lib/native-bindings.mjs";

const uiohookDir = path.join(process.cwd(), "node_modules", "uiohook-napi");

function assertUiohookReady(label) {
  const node = findUiohookNode(uiohookDir);
  if (!node || isForeignUiohookPath(node)) {
    console.error(`[rebuild] uiohook-napi not ready for ${process.platform}/${process.arch} (${label})`);
    if (node) console.error(`  found: ${node}`);
    console.error("  On macOS: install Xcode Command Line Tools (`xcode-select --install`).");
    console.error("  Then: rm -rf node_modules && npm ci");
    process.exit(1);
  }
  console.log(`[rebuild] uiohook-napi → ${node}`);
}

scrubForeignUiohookPrebuilds(uiohookDir);
execSync("electron-rebuild -f -w better-sqlite3 uiohook-napi", { stdio: "inherit" });

let uiohookNode = findUiohookNode(uiohookDir);
if (!uiohookNode || isForeignUiohookPath(uiohookNode)) {
  const prebuilds = path.join(uiohookDir, "prebuilds");
  if (fs.existsSync(prebuilds)) {
    fs.rmSync(prebuilds, { recursive: true, force: true });
    console.log("[rebuild] removed uiohook prebuilds — forcing source compile");
  }
  execSync("electron-rebuild -f -w uiohook-napi", { stdio: "inherit" });
}

assertUiohookReady("final");
