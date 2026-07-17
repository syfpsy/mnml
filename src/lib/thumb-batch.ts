import { bridge } from "./bridge";

const THUMB_CACHE_CAP = 64;
const urlCache = new Map<number, string | null>();
const pending = new Set<number>();
const waiters = new Map<number, Set<(url: string | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on clear so in-flight IPC cannot refill the cache after hide. */
let cacheGen = 0;

function remember(id: number, url: string | null) {
  if (urlCache.has(id)) urlCache.delete(id);
  urlCache.set(id, url);
  while (urlCache.size > THUMB_CACHE_CAP) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    urlCache.delete(oldest);
  }
}

function notify(id: number, url: string | null) {
  remember(id, url);
  const subs = waiters.get(id);
  if (subs) {
    for (const fn of subs) fn(url);
    waiters.delete(id);
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  const gen = cacheGen;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (gen !== cacheGen) return;
    const ids = [...pending];
    pending.clear();
    if (ids.length === 0) return;
    void bridge.getImageDataUrls(ids).then((batch) => {
      if (gen !== cacheGen) return;
      for (const id of ids) {
        notify(id, batch[id] ?? null);
      }
    }).catch(() => {
      if (gen !== cacheGen) return;
      for (const id of ids) notify(id, null);
    });
  }, 32);
}

/** Drop cached data-URLs (call on panel hide to free renderer heap). */
export function clearThumbCache() {
  cacheGen += 1;
  urlCache.clear();
  pending.clear();
  waiters.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Batched, debounced thumb fetch — coalesces per-row requests into one IPC. */
export function requestThumbUrl(id: number, cb: (url: string | null) => void): () => void {
  if (urlCache.has(id)) {
    const cached = urlCache.get(id)!;
    // LRU touch
    urlCache.delete(id);
    urlCache.set(id, cached);
    cb(cached);
    return () => {};
  }
  if (!waiters.has(id)) waiters.set(id, new Set());
  waiters.get(id)!.add(cb);
  pending.add(id);
  scheduleFlush();
  return () => { waiters.get(id)?.delete(cb); };
}
