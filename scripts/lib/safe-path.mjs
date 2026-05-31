import path from "node:path";

const UNSAFE_CHARS = /[<>:"|?*\x00-\x1f]/;

export function assertSafeBasename(name) {
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

export function isResolvedPathWithinBase(resolvedPath, baseDir) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(resolvedPath);
  if (base === resolved) return true;
  const rel = path.relative(base, resolved);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function resolvePathWithinBase(baseDir, ...segments) {
  const base = path.resolve(baseDir);
  for (const seg of segments) assertSafeBasename(seg);
  const resolved = path.resolve(base, ...segments);
  if (!isResolvedPathWithinBase(resolved, base)) {
    throw new Error(`Path escapes base directory: ${resolved}`);
  }
  return resolved;
}
