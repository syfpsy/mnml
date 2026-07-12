import { bridge } from "./bridge";

const urlCache = new Map<number, string | null>();
const pending = new Set<number>();
const waiters = new Map<number, Set<(url: string | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function notify(id: number, url: string | null) {
  urlCache.set(id, url);
  const subs = waiters.get(id);
  if (subs) {
    for (const fn of subs) fn(url);
    waiters.delete(id);
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = [...pending];
    pending.clear();
    if (ids.length === 0) return;
    void bridge.getImageDataUrls(ids).then((batch) => {
      for (const id of ids) {
        notify(id, batch[id] ?? null);
      }
    }).catch(() => {
      for (const id of ids) notify(id, null);
    });
  }, 32);
}

/** Batched, debounced thumb fetch — coalesces per-row requests into one IPC. */
export function requestThumbUrl(id: number, cb: (url: string | null) => void): () => void {
  if (urlCache.has(id)) {
    cb(urlCache.get(id)!);
    return () => {};
  }
  if (!waiters.has(id)) waiters.set(id, new Set());
  waiters.get(id)!.add(cb);
  pending.add(id);
  scheduleFlush();
  return () => { waiters.get(id)?.delete(cb); };
}
