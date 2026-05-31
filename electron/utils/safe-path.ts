import path from "node:path";

const UNSAFE_CHARS = /[<>:"|?*\x00-\x1f]/;

/** Reject path segments that could escape a base directory or carry separators. */
export function assertSafeBasename(name: string): void {
  if (!name || name === "." || name === "..") {
    throw new Error(`Unsafe path segment: ${name}`);
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error(`Unsafe path segment: ${name}`);
  }
  if (name.includes("..")) {
    throw new Error(`Unsafe path segment: ${name}`);
  }
  if (UNSAFE_CHARS.test(name)) {
    throw new Error(`Unsafe path segment: ${name}`);
  }
}

/** True when `resolvedPath` is equal to or nested under `baseDir`. */
export function isResolvedPathWithinBase(resolvedPath: string, baseDir: string): boolean {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(resolvedPath);
  if (base === resolved) return true;
  const rel = path.relative(base, resolved);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Resolve `...segments` under `baseDir` and verify the result cannot escape
 * the base directory (path traversal guard).
 */
export function resolvePathWithinBase(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  for (const seg of segments) assertSafeBasename(seg);
  const resolved = path.resolve(base, ...segments);
  if (!isResolvedPathWithinBase(resolved, base)) {
    throw new Error(`Path escapes base directory: ${resolved}`);
  }
  return resolved;
}

/** Validate an already-resolved path stays under `baseDir`. */
export function assertResolvedWithinBase(resolvedPath: string, baseDir: string): string {
  const resolved = path.resolve(resolvedPath);
  if (!isResolvedPathWithinBase(resolved, baseDir)) {
    throw new Error(`Path escapes base directory: ${resolved}`);
  }
  return resolved;
}

const IMAGE_HASH_RE = /^[a-f0-9]{40}$/i;

/** Resolve a clipboard image file path from a SHA-1 hash under `imagesBaseDir`. */
export function resolveImagePath(imagesBaseDir: string, hash: string): string {
  if (!IMAGE_HASH_RE.test(hash)) {
    throw new Error("Invalid image hash");
  }
  return resolvePathWithinBase(imagesBaseDir, `${hash}.png`);
}
