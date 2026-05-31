import { nativeImage } from "electron";
import fs from "node:fs";
import { getById } from "./db/items.js";

const THUMB_SIZE      = 96;
const THUMB_CACHE_CAP = 64;
const thumbCache      = new Map<number, string>();

function rememberThumb(id: number, dataUrl: string) {
  if (thumbCache.has(id)) thumbCache.delete(id);
  thumbCache.set(id, dataUrl);
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

export function getThumbDataUrl(id: number): string | null {
  if (thumbCache.has(id)) {
    const cached = thumbCache.get(id)!;
    thumbCache.delete(id);
    thumbCache.set(id, cached);
    return cached;
  }
  const item = getById(id);
  if (!item || item.type !== "image" || !item.image_path) return null;
  if (!fs.existsSync(item.image_path)) return null;
  try {
    const img = nativeImage.createFromPath(item.image_path);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    const scaled =
      width > THUMB_SIZE || height > THUMB_SIZE
        ? img.resize(width >= height
            ? { width: THUMB_SIZE, quality: "good" }
            : { height: THUMB_SIZE, quality: "good" })
        : img;
    const url = `data:image/png;base64,${scaled.toPNG().toString("base64")}`;
    rememberThumb(id, url);
    return url;
  } catch {
    return null;
  }
}
