import { clipboard, ClipboardItem, nativeImage } from "electron";
import fs from "node:fs";
import { insertOrTouch, trimToMax, updateTitle, getById, type Item } from "../db/items.js";
import { getSetting } from "../db/settings.js";
import { imagesDir } from "../db/index.js";
import { sha1 } from "../utils/hash.js";
import { classifyText } from "./classifier.js";
import { fetchTitle } from "../utils/link-meta.js";
import { evictThumb } from "../thumb-cache.js";
import { log } from "../utils/log.js";
import { assertResolvedWithinBase, resolveImagePath } from "../utils/safe-path.js";

type Listener = (item: Item) => void;

const POLL_MS_VISIBLE = 500;
const POLL_MS_HIDDEN  = 2_000;
const listeners = new Set<Listener>();
const updateListeners = new Set<Listener>();

/** Raw OS clipboard format as Electron (≥44) lists it in `ClipboardItem.types`. */
const osFormat = (name: string) => `electron application/osclipboard;format="${name}"`;

/**
 * "Don't keep this" markers.
 *
 * Password managers (1Password, KeePass / KeePassXC, Bitwarden) and browsers
 * (on password fields) set these so OS clipboard history and third-party
 * monitors skip the content. mnml respects them — a clipboard manager that
 * silently archives your passwords to a local SQLite file (and, with
 * folder-sync, up to your cloud) is a real liability. Markers are checked
 * from the type list BEFORE any text/image is read, so concealed content is
 * never even pulled into memory or hashed.
 *
 *   Windows
 *   - `ExcludeClipboardContentFromMonitorProcessing` — its mere presence
 *     means "monitors should not process this". The de-facto standard.
 *   - `CanIncludeInClipboardHistory` — a DWORD; value 0 means "keep out of
 *     clipboard history". Belt-and-suspenders for sources that use it.
 *   macOS (nspasteboard.org convention)
 *   - `org.nspasteboard.ConcealedType` — passwords; `TransientType` — "don't record".
 */
const EXCLUDE_MARKERS = [
  osFormat("ExcludeClipboardContentFromMonitorProcessing"),
  osFormat("org.nspasteboard.ConcealedType"),
  osFormat("org.nspasteboard.TransientType"),
];
const CAN_INCLUDE_MARKER = osFormat("CanIncludeInClipboardHistory");

/** Logged once per concealed episode (not every 500 ms poll). */
let wasConcealed = false;

async function isClipboardConcealed(item: ClipboardItem): Promise<boolean> {
  try {
    if (EXCLUDE_MARKERS.some((m) => item.types.includes(m))) return true;
    if (!item.types.includes(CAN_INCLUDE_MARKER)) return false;
    const blob = (await item.getType(CAN_INCLUDE_MARKER)) as Blob;
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length >= 4 && buf.readUInt32LE(0) === 0) return true;
    if (buf.length >= 1 && buf.readUInt8(0) === 0) return true;
    return false;
  } catch {
    // Fail closed: if we can't read the markers, skip capture rather than
    // risk archiving concealed content (passwords, OTP fields).
    return true;
  }
}

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
 * Image-poll throttle: `getType("image/png")` makes Electron decode the whole
 * PNG on the main thread (~26 ms for a Retina screenshot), so it must not run
 * every tick. Listing types is ~0.5 ms, so we re-read the image only when the
 * type list changed or IMAGE_RECHECK_MS passed (a new screenshot over an old
 * one keeps the same types). The PNG's byte size is the cheap fingerprint
 * before the sha1 — Chromium's encode is deterministic, so same image → same size.
 */
let lastTypesKey = "";
let lastImageCheckedAt = 0;
let lastImageBytes = 0;
const IMAGE_RECHECK_MS = 2_000;
/** Bumped on stop() so an in-flight read cannot insert after monitor off. */
let monitorEpoch = 0;

let pollIntervalMs = POLL_MS_HIDDEN;
let pollInFlight = false;
/** Serializes polls and restores — a restore must never interleave with a poll's reads. */
let clipboardQueue: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = clipboardQueue.then(fn, fn);
  clipboardQueue = run.catch(() => {});
  return run;
}

function armPollTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(poll, pollIntervalMs);
}

/** Slower poll while the panel is hidden — less main-thread work in the tray. */
export function setClipboardPollCadence(panelVisible: boolean) {
  const next = panelVisible ? POLL_MS_VISIBLE : POLL_MS_HIDDEN;
  if (next === pollIntervalMs && timer) return;
  pollIntervalMs = next;
  if (timer) armPollTimer();
}

export function onNewItem(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function start() {
  if (timer) return;
  // Initialize baseline so we don't capture whatever was already on the
  // clipboard on launch. The baseline read honors the sensitive-content
  // guard like any poll: concealed content leaves empty hashes, so the next
  // non-concealed clipboard write — text or image — is captured normally.
  const epoch = monitorEpoch;
  void exclusive(() => readClipboard(epoch, /*baselineOnly*/ true))
    .catch((err) => log("[clipboard] baseline error:", String(err)));
  pollIntervalMs = POLL_MS_HIDDEN;
  armPollTimer();
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  // Invalidate in-flight reads so stop/quit cannot reopen DB or insert.
  monitorEpoch += 1;
  // Reset the fingerprint so a re-start triggers a fresh confirmation.
  lastTypesKey       = "";
  lastImageCheckedAt = 0;
  lastImageBytes     = 0;
}

function emit(item: Item) {
  for (const l of listeners) l(item);
}

async function captureTextIfChanged(epoch: number, baselineOnly: boolean): Promise<void> {
  const text = await clipboard.readText();
  if (epoch !== monitorEpoch || !text) return;
  const h = sha1(text);
  if (h === lastTextHash) return;
  lastTextHash = h;
  if (baselineOnly) return;

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
    fetchTitle(c.url)
      .then((title) => {
        if (!title) return;
        if (!getById(item.id)) return;
        updateTitle(item.id, title);
        const current = getById(item.id);
        if (current) emitUpdate({ ...current, title });
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
}

async function captureImageIfChanged(item: ClipboardItem, epoch: number, baselineOnly: boolean): Promise<void> {
  const blob = await item.getType("image/png");
  if (epoch !== monitorEpoch || blob.size === 0 || blob.size === lastImageBytes) return;
  const png = Buffer.from(await blob.arrayBuffer());
  if (epoch !== monitorEpoch) return;
  lastImageBytes = blob.size;
  const h = sha1(png);
  if (h === lastImageHash) return;
  lastImageHash = h;
  if (baselineOnly) return;
  await saveImage(png, h, epoch);
}

/** One serialized clipboard read: concealed guard → text → image. */
async function readClipboard(epoch: number, baselineOnly = false): Promise<void> {
  const [item] = await clipboard.read();
  if (epoch !== monitorEpoch || !item) return;

  // Respect sensitive content the source app asked us not to keep (password
  // managers, browser password fields). Checked first — concealed content is
  // never read or hashed. Type listing only; no DB access, so this doesn't
  // disturb the idle-close timer.
  if (await isClipboardConcealed(item)) {
    if (!wasConcealed) {
      log("[clipboard] skipping content marked sensitive by the source app");
      wasConcealed = true;
    }
    if (baselineOnly) {
      lastTextHash   = "";
      lastImageHash  = "";
      lastImageBytes = 0;
    }
    return;
  }
  wasConcealed = false;

  const typesKey = item.types.join("|");
  const typesChanged = typesKey !== lastTypesKey;
  lastTypesKey = typesKey;

  // Dual-format clipboards (image + text) capture both, text first.
  if (item.types.includes("text/plain")) await captureTextIfChanged(epoch, baselineOnly);

  if (!item.types.some((t) => t.startsWith("image/"))) return;
  const now = Date.now();
  if (!typesChanged && now - lastImageCheckedAt < IMAGE_RECHECK_MS) return;
  lastImageCheckedAt = now;
  await captureImageIfChanged(item, epoch, baselineOnly);
}

function poll() {
  // No `getSetting("monitoring")` gate here. The poll timer only runs while
  // monitoring is enabled — `start()` / `stop()` are driven directly by the
  // setting (see ipc.ts + main.ts), so if `poll` is executing, monitoring is
  // on. Reading the setting every 500 ms would also call `getDb()` every
  // tick, which would keep re-arming the DB's idle-close timer and pin the
  // SQLite file open forever — defeating the folder-sync handoff.
  if (pollInFlight) return;
  pollInFlight = true;
  const epoch = monitorEpoch;
  void exclusive(() => readClipboard(epoch))
    // keep polling even if one read fails
    .catch((err) => log("[clipboard] poll error:", String(err)))
    .finally(() => { pollInFlight = false; });
}

/** PNG IHDR holds width/height at fixed offsets — no decode needed. */
function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24) return { width: 0, height: 0 };
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function saveImage(png: Buffer, hash: string, epoch: number) {
  if (epoch !== monitorEpoch) return;
  const dir = imagesDir();
  const filepath = resolveImagePath(dir, hash);
  try {
    if (!fs.existsSync(filepath)) {
      await fs.promises.writeFile(filepath, png);
    }
  } catch (err) {
    log("[clipboard] image write failed:", String(err));
    return;
  }
  if (epoch !== monitorEpoch) return;

  const { width, height } = pngSize(png);
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
  for (const id of trimToMax(max)) evictThumb(id);
}

/** Text write + baseline so the next poll doesn't re-capture our own write. */
async function writeTextBaseline(text: string) {
  clipboard.clear(); // O16: a text write alone can leave a previous image on the clipboard.
  await clipboard.writeText(text);
  lastTextHash   = sha1(text);
  lastImageHash  = "";
  lastImageBytes = 0;
}

// Re-copy an item back to the system clipboard. Resolves false if nothing was written.
export function restoreItem(item: Item): Promise<boolean> {
  return exclusive(async () => {
    if (item.type === "image" && item.image_path) {
      let imagePath: string;
      try {
        imagePath = assertResolvedWithinBase(item.image_path, imagesDir());
      } catch {
        log("[clipboard] restore: image path outside managed dir — skipping");
        return false;
      }
      if (!fs.existsSync(imagePath)) {
        log("[clipboard] restore: image file missing — skipping");
        return false;
      }
      const png = await fs.promises.readFile(imagePath);
      if (nativeImage.createFromBuffer(png).isEmpty()) {
        log("[clipboard] restore: image unreadable — skipping");
        return false;
      }
      clipboard.clear();
      await clipboard.write([new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) })]);
      // Baseline from what the clipboard actually holds after the write — the OS
      // round-trip re-encodes, so the on-disk file hash would re-capture it.
      const [current] = await clipboard.read();
      lastTypesKey = current?.types.join("|") ?? "";
      lastImageCheckedAt = Date.now();
      const held = current ? await current.getType("image/png") : null;
      if (held && held.size > 0) {
        lastImageBytes = held.size;
        lastImageHash = sha1(Buffer.from(await held.arrayBuffer()));
      }
      lastTextHash = "";
      return true;
    }
    const value = item.content_text ?? item.content_url ?? item.preview;
    if (!value) return false;
    await writeTextBaseline(value);
    return true;
  });
}

/**
 * Write a plain text snippet to the clipboard. Used by the saved-snippets
 * restore path. Updates `lastTextHash` so the monitor's next poll doesn't
 * re-capture our own write as a new clipboard entry.
 */
export function restoreText(text: string): Promise<void> {
  return exclusive(() => writeTextBaseline(text));
}
