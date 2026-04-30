export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/**
 * Split `text` into [chunk, isMatch] pairs for query-term highlighting.
 * Tokens shorter than 2 chars are ignored to avoid noise.
 */
export function splitHighlight(text: string, query: string): [string, boolean][] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (!words.length) return [[text, false]];

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  const out: [string, boolean][] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push([text.slice(last, m.index), false]);
    out.push([m[0], true]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push([text.slice(last), false]);

  return out.length > 0 ? out : [[text, false]];
}
