/**
 * check-site-security-headers.mjs
 *
 * Validates launch-critical security headers for the static Vercel site.
 * Replaces a Next.js next.config.ts header check — mnml's marketing site is
 * plain HTML in /site with headers declared in vercel.json.
 *
 * Usage:
 *   npm run check:site-headers
 *   MNML_SITE_URL=https://mnml-bay.vercel.app npm run check:site-headers
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const vercelPath = join(root, "vercel.json");

/** Header names we require on every HTML response (case-insensitive match). */
const REQUIRED = [
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
  "content-security-policy",
];

/** Minimum CSP directives for the static landing site. */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src",
  "style-src 'self'",
  "img-src",
  "frame-ancestors 'none'",
];

const failures = [];

function readVercelConfig() {
  try {
    return JSON.parse(readFileSync(vercelPath, "utf8"));
  } catch (err) {
    failures.push(`Could not read vercel.json: ${err.message}`);
    return null;
  }
}

function headerMapFromVercel(config) {
  const blocks = config?.headers ?? [];
  const catchAll = blocks.find((b) => b.source === "/(.*)");
  if (!catchAll?.headers?.length) {
    failures.push('vercel.json must define a "/(.*)" headers block.');
    return null;
  }
  const map = new Map();
  for (const { key, value } of catchAll.headers) {
    map.set(key.toLowerCase(), value);
  }
  return map;
}

function validateConfiguredHeaders(map) {
  for (const name of REQUIRED) {
    if (!map.has(name)) {
      failures.push(`vercel.json missing header: ${name}`);
    }
  }

  const xfo = map.get("x-frame-options")?.toUpperCase() ?? "";
  if (xfo !== "DENY" && xfo !== "SAMEORIGIN") {
    failures.push('X-Frame-Options must be DENY or SAMEORIGIN.');
  }

  const csp = map.get("content-security-policy") ?? "";
  for (const directive of CSP_DIRECTIVES) {
    if (!csp.includes(directive)) {
      failures.push(`Content-Security-Policy missing "${directive}" directive.`);
    }
  }
}

async function validateLiveHeaders(siteUrl) {
  let res;
  try {
    res = await fetch(siteUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    failures.push(`Live header check failed for ${siteUrl}: ${err.message}`);
    return;
  }

  if (!res.ok) {
    failures.push(`Live header check: ${siteUrl} returned HTTP ${res.status}.`);
    return;
  }

  const live = new Map();
  for (const [key, value] of res.headers.entries()) {
    live.set(key.toLowerCase(), value);
  }

  for (const name of REQUIRED) {
    if (!live.has(name)) {
      failures.push(`Live site missing header: ${name} (${siteUrl})`);
    }
  }

  const liveCsp = live.get("content-security-policy") ?? "";
  if (!liveCsp.includes("frame-ancestors 'none'")) {
    failures.push(`Live CSP missing frame-ancestors 'none' (${siteUrl}).`);
  }
}

const config = readVercelConfig();
if (config) {
  const map = headerMapFromVercel(config);
  if (map) validateConfiguredHeaders(map);
}

const siteUrl = (process.env.MNML_SITE_URL ?? process.env.SITE_URL ?? "").trim();
if (siteUrl) {
  await validateLiveHeaders(siteUrl.replace(/\/+$/, "") + "/");
}

if (failures.length > 0) {
  console.error("Site security header check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Site security headers ok");
if (siteUrl) console.log(`Live URL verified: ${siteUrl}`);
