const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;

export function isUrl(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 2048 || /\s/.test(t)) return false;
  return URL_RE.test(t);
}

export function parseUrl(s: string): { url: string; hostname: string } | null {
  const t = s.trim();
  if (!isUrl(t)) return null;
  const withProto = t.startsWith("http") ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    return { url: u.toString(), hostname: u.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}
