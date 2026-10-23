import { isUrl, parseUrl } from "../utils/urls.js";

// `text` is what the user copied (trimmed) and what paste gives back; a link's
// `url` is the normalized form (punycode, trailing slash) used only to fetch its title.
export type Classified =
  | { type: "link"; text: string; url: string; hostname: string; preview: string }
  | { type: "text"; text: string; preview: string };

const PREVIEW_MAX = 280;

export function classifyText(raw: string): Classified | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const preview =
    trimmed.length > PREVIEW_MAX ? trimmed.slice(0, PREVIEW_MAX) + "…" : trimmed;

  if (isUrl(trimmed)) {
    const p = parseUrl(trimmed);
    if (p) return { type: "link", text: trimmed, url: p.url, hostname: p.hostname, preview };
  }

  return { type: "text", text: trimmed, preview };
}
