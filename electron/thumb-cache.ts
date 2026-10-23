import { nativeImage } from "electron";
import fs from "node:fs";
import { getById } from "./db/items.js";
import { managedImagePath } from "./utils/safe-path.js";
import { imagesDir } from "./db/index.js";

const THUMB_SIZE      = 96;
const THUMB_CACHE_CAP = 64;
/** Keyed by id, checked by hash: a folder-synced DB swap can give an id another image. */
const thumbCache      = new Map<number, { hash: string; url: string }>();

function rememberThumb(id: number, hash: string, url: string) {
  if (thumbCache.has(id)) thumbCache.delete(id);
  thumbCache.set(id, { hash, url });
  if (thumbCache.size > THUMB_CACHE_CAP) {
    const oldest = thumbCache.keys().next().value;
    if (oldest !== undefined) thumbCache.delete(oldest);
  }
}

export function evictThumb(id: number) {
  thumbCache.delete(id);
}

export function evictAllThumbs() {
  thumbCache.clear();
}

export function getThumbDataUrls(ids: number[]): Record<number, string | null> {
  const out: Record<number, string | null> = {};
  for (const id of ids) {
    if (!Number.isFinite(id) || id <= 0) continue;
    out[id] = getThumbDataUrl(id);
  }
  return out;
}

export function getThumbDataUrl(id: number): string | null {
  const item = getById(id);
  if (!item || item.type !== "image" || !item.image_path) return null;
  const cached = thumbCache.get(id);
  if (cached?.hash === item.hash) {
    thumbCache.delete(id);
    thumbCache.set(id, cached);
    return cached.url;
  }
  let imagePath: string;
  try {
    imagePath = managedImagePath(item.image_path, imagesDir());
  } catch {
    return null;
  }
  if (!fs.existsSync(imagePath)) return null;
  try {
    const img = nativeImage.createFromPath(imagePath);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    const scaled =
      width > THUMB_SIZE || height > THUMB_SIZE
        ? img.resize(width >= height
            ? { width: THUMB_SIZE, quality: "good" }
            : { height: THUMB_SIZE, quality: "good" })
        : img;
    const url = `data:image/png;base64,${scaled.toPNG().toString("base64")}`;
    rememberThumb(id, item.hash, url);
    return url;
  } catch {
    return null;
  }
}
