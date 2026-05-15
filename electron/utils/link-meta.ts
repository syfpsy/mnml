import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import { log } from "./log.js";

const MAX_REDIRECTS = 2;
const TIMEOUT_MS = 4_000;
const MAX_BYTES = 8_192;

/**
 * Reject hostnames that resolve to private / link-local / loopback ranges.
 *
 * The clipboard-monitor enriches link items by fetching the URL's `<title>`.
 * Without this guard, a user who copies (or is induced to copy) a URL like
 * `http://192.168.1.1/admin` causes mnml to probe the intranet and store
 * the response title in clipboard history. SSRF-lite — user-triggered, not
 * remote, but still a real privacy / info-disclosure surface.
 *
 * Heuristic only — operates on the literal hostname, not on DNS resolution.
 * A public domain that A-records to 10.x.x.x would not be caught here.
 * Closing that hole requires resolving + comparing addresses; current
 * filter covers the obvious cases.
 */
function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".localhost")) return true;
  // IPv4 — loopback, RFC1918 private, link-local
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h))  return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  // IPv6 — loopback, unique-local (fc00::/7), link-local (fe80::/10)
  if (h === "::1" || h.startsWith("[::1") || h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
  return false;
}

/**
 * Fetch just the <title> tag from a URL.  Non-blocking — all errors resolve to null.
 * Used for enriching link items after they are inserted.
 */
export function fetchTitle(
  url: string,
  redirectsLeft = MAX_REDIRECTS,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        resolve(null);
        return;
      }
      // SSRF guard — see comment on `isPrivateHostname`. Applied here AND
      // in the redirect-follow branch below so a public URL can't 302 us
      // into the intranet.
      if (isPrivateHostname(parsed.hostname)) {
        resolve(null);
        return;
      }

      const mod = parsed.protocol === "https:" ? https : http;

      const req = mod.request(
        {
          method: "GET",
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + parsed.search,
          headers: {
            "User-Agent": "mnml/0.1 (clipboard manager; title fetch)",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en",
            Connection: "close",
          },
        },
        (res) => {
          const loc = res.headers.location;
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            loc &&
            redirectsLeft > 0
          ) {
            res.resume();
            // Re-enter via fetchTitle so the private-hostname guard at the
            // top runs against the resolved redirect target. Bare URL
            // resolution alone (`new URL(loc, url)`) wouldn't filter
            // a 302 → http://192.168.1.1/, but the recursive call does.
            resolve(
              fetchTitle(new URL(loc, url).href, redirectsLeft - 1),
            );
            return;
          }

          if (
            !res.statusCode ||
            res.statusCode < 200 ||
            res.statusCode >= 300
          ) {
            res.resume();
            resolve(null);
            return;
          }

          const ct = (res.headers["content-type"] ?? "").toLowerCase();
          if (!ct.includes("html")) {
            res.resume();
            resolve(null);
            return;
          }

          const chunks: Buffer[] = [];
          let total = 0;

          res.on("data", (chunk: Buffer) => {
            total += chunk.length;
            chunks.push(chunk);
            // Decode all collected bytes as UTF-8 so multi-byte chars are never split.
            const text = Buffer.concat(chunks).toString("utf8");
            const m = text.match(/<title[^>]*>([\s\S]{1,400}?)<\/title>/i);
            if (m || total >= MAX_BYTES) {
              res.destroy();
              resolve(m ? cleanTitle(m[1]) : null);
            }
          });

          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const m = text.match(/<title[^>]*>([\s\S]{1,400}?)<\/title>/i);
            resolve(m ? cleanTitle(m[1]) : null);
          });

          res.on("error", () => resolve(null));
        },
      );

      req.setTimeout(TIMEOUT_MS, () => {
        req.destroy();
        resolve(null);
      });

      req.on("error", (err) => {
        log("[link-meta] fetch error:", err.message);
        resolve(null);
      });

      req.end();
    } catch (err) {
      log("[link-meta] url parse error:", String(err));
      resolve(null);
    }
  });
}

function cleanTitle(raw: string): string | null {
  const t = raw
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 0 ? t.slice(0, 200) : null;
}
