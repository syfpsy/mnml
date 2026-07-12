#!/usr/bin/env node
/**
 * Rebuild native addons for the current OS + CPU.
 * - better-sqlite3: always electron-rebuild (no prebuilds).
 * - uiohook-napi: npm ships prebuilds — scrub foreign platforms only; compile only if missing.
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
    if (process.platform === "darwin") {
      console.error("  Install Xcode CLT: xcode-select --install");
    } else if (process.platform === "win32") {
      console.error("  Reinstall: rm -rf node_modules && npm ci");
    }
    process.exit(1);
  }
  console.log(`[rebuild] uiohook-napi → ${node}`);
}

scrubForeignUiohookPrebuilds(uiohookDir);

function bindingsReady() {
  try {
    execSync("node scripts/verify-native-bindings.mjs", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (bindingsReady()) {
  console.log("[rebuild] native bindings already valid for this platform — skipping electron-rebuild");
  assertUiohookReady("cached");
  process.exit(0);
}

// better-sqlite3 must match Electron ABI; uiohook uses shipped prebuilds on win/mac.
execSync("electron-rebuild -f -w better-sqlite3", { stdio: "inherit" });

let uiohookNode = findUiohookNode(uiohookDir);
if (!uiohookNode || isForeignUiohookPath(uiohookNode)) {
  console.log("[rebuild] uiohook prebuild missing — compiling from source");
  execSync("electron-rebuild -f -w uiohook-napi", { stdio: "inherit" });
}

assertUiohookReady("final");
