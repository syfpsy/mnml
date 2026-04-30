import { clipboard, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { insertOrTouch, trimToMax, updateTitle, type Item } from "../db/items.js";
import { getSetting } from "../db/settings.js";
import { imagesDir } from "../db/index.js";
import { markIndexDirty } from "../search/service.js";
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

export function onNewItem(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function start() {
  if (timer) return;
  // initialize baseline so we don't capture whatever was already on the clipboard on launch
  lastTextHash = sha1(clipboard.readText() ?? "");
  const img = clipboard.readImage();
  lastImageHash = img.isEmpty() ? "" : sha1(img.toPNG());

  timer = setInterval(poll, POLL_MS);
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
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
      const png = img.toPNG();
      const h = sha1(png);
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
      markIndexDirty();
      trim();
      emit(item);
      // Background title enrichment — fire and forget
      fetchTitle(c.url)
        .then((title) => {
          if (!title) return;
          updateTitle(item.id, title);
          markIndexDirty();
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
      markIndexDirty();
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
  markIndexDirty();
  trim();
  emit(item);
}

function trim() {
  const max = getSetting("maxItems");
  if (!max || max <= 0) return;
  const { deletedIds } = trimToMax(max);
  if (deletedIds.length) markIndexDirty();
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
