import { clipboard, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { insertOrTouch, trimToMax, updateTitle, type Item } from "../db/items.js";
import { getSetting } from "../db/settings.js";
import { imagesDir } from "../db/index.js";
import { sha1 } from "../utils/hash.js";
import { classifyText } from "./classifier.js";
import { fetchTitle } from "../utils/link-meta.js";
import { log } from "../utils/log.js";

type Listener = (item: Item) => void;

const POLL_MS = 500;
const listeners = new Set<Listener>();
const updateListeners = new Set<Listener>();

export function onItemUpdated(l: Listener): () => void {
  updateListeners.add(l);
  return () => updateListeners.delete(l);
}

function emitUpdate(item: Item) {
  for (const l of updateListeners) l(item);
}

let lastTextHash = "";
let lastImageHash = "";
let timer: NodeJS.Timeout | null = null;

/**
 * Image-poll throttle: clipboard.toPNG() re-encodes the entire bitmap on
 * every call, which for a 4K screenshot is several MB of allocation churn
 * every 500 ms. We use the image's dimensions as a cheap fingerprint and
 * only run the full PNG hash when (a) dimensions changed or (b) it has
 * been > IMAGE_RECHECK_MS since the last confirmation. Worst case: a new
 * image with identical dimensions to the previous one is captured up to
 * IMAGE_RECHECK_MS late — acceptable for a clipboard manager.
 */
let lastImageSizeKey = "";
let lastImageCheckedAt = 0;
const IMAGE_RECHECK_MS = 4_000;

export function onNewItem(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function start() {
  if (timer) return;
  // initialize baseline so we don't capture whatever was already on the clipboard on launch
  lastTextHash = sha1(clipboard.readText() ?? "");
  const img = clipboard.readImage();
  if (img.isEmpty()) {
    lastImageHash      = "";
    lastImageSizeKey   = "";
    lastImageCheckedAt = 0;
  } else {
    lastImageHash      = sha1(img.toPNG());
    const { width, height } = img.getSize();
    lastImageSizeKey   = `${width}x${height}`;
    lastImageCheckedAt = Date.now();
  }

  timer = setInterval(poll, POLL_MS);
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  // Reset image fingerprint so a re-start triggers a fresh confirmation.
  lastImageSizeKey   = "";
  lastImageCheckedAt = 0;
}

function emit(item: Item) {
  for (const l of listeners) l(item);
}

function poll() {
  if (!getSetting("monitoring")) return;

  try {
    // image first — when copying screenshots, text is usually empty
    const img = clipboard.readImage();
    if (!img.isEmpty()) {
      // Cheap dimension fingerprint — getSize() is O(1) (reads cached field
      // from the wrapping NativeImage; no decode). If dimensions match what
      // we already hashed AND we re-confirmed recently, the image is almost
      // certainly the same — skip the expensive toPNG() + sha1.
      const { width, height } = img.getSize();
      const sizeKey = `${width}x${height}`;
      const now = Date.now();
      if (sizeKey === lastImageSizeKey && now - lastImageCheckedAt < IMAGE_RECHECK_MS) {
        return;
      }
      const png = img.toPNG();
      const h = sha1(png);
      lastImageSizeKey   = sizeKey;
      lastImageCheckedAt = now;
      if (h !== lastImageHash) {
        lastImageHash = h;
        lastTextHash = sha1(clipboard.readText() ?? ""); // suppress concurrent text dup
        saveImage(png, img, h);
      }
      return;
    }

    const text = clipboard.readText();
    if (!text) return;
    const h = sha1(text);
    if (h === lastTextHash) return;
    lastTextHash = h;

    const c = classifyText(text);
    if (!c) return;

    if (c.type === "link") {
      const item = insertOrTouch({
        type: "link",
        content_text: c.url,
        content_url: c.url,
        hostname: c.hostname,
        preview: c.preview,
        byte_size: c.url.length,
        hash: h,
      });
      trim();
      emit(item);
      // Background title enrichment — fire and forget
      fetchTitle(c.url)
        .then((title) => {
          if (!title) return;
          updateTitle(item.id, title);
          emitUpdate({ ...item, title });
        })
        .catch(() => {});
    } else {
      const item = insertOrTouch({
        type: "text",
        content_text: c.text,
        preview: c.preview,
        byte_size: c.text.length,
        hash: h,
      });
      trim();
      emit(item);
    }
  } catch (err) {
    // keep polling even if one read fails
    log("[clipboard] poll error:", String(err));
  }
}

function saveImage(png: Buffer, img: Electron.NativeImage, hash: string) {
  const dir = imagesDir();
  const filename = `${hash}.png`;
  const filepath = path.join(dir, filename);
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, png);

  const { width, height } = img.getSize();
  const preview = `Image · ${width}×${height}`;
  const item = insertOrTouch({
    type: "image",
    image_path: filepath,
    preview,
    title: `${width}×${height}`,
    content_text: preview,
    byte_size: png.byteLength,
    hash,
  });
  trim();
  emit(item);
}

function trim() {
  const max = getSetting("maxItems");
  if (!max || max <= 0) return;
  trimToMax(max);
}

// Re-copy an item back to the system clipboard.
export function restoreItem(item: Item) {
  if (item.type === "image" && item.image_path && fs.existsSync(item.image_path)) {
    const nImg = nativeImage.createFromPath(item.image_path);
    clipboard.writeImage(nImg);
    lastImageHash = sha1(nImg.toPNG());
    return;
  }
  const value = item.content_text ?? item.content_url ?? item.preview;
  clipboard.writeText(value);
  lastTextHash = sha1(value);
}

/**
 * Write a plain text snippet to the clipboard. Used by the saved-snippets
 * restore path. Updates `lastTextHash` so the monitor's next poll doesn't
 * re-capture our own write as a new clipboard entry.
 */
export function restoreText(text: string) {
  clipboard.writeText(text);
  lastTextHash = sha1(text);
}
