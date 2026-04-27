import { isUrl, parseUrl } from "../utils/urls.js";

export type Classified =
  | { type: "link"; url: string; hostname: string; preview: string }
  | { type: "text"; text: string; preview: string };

const PREVIEW_MAX = 280;

export function classifyText(raw: string): Classified | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isUrl(trimmed)) {
    const p = parseUrl(trimmed);
    if (p) {
      return {
        type: "link",
        url: p.url,
        hostname: p.hostname,
        preview: p.url.length > PREVIEW_MAX ? p.url.slice(0, PREVIEW_MAX) + "…" : p.url,
      };
    }
  }

  const preview =
    trimmed.length > PREVIEW_MAX ? trimmed.slice(0, PREVIEW_MAX) + "…" : trimmed;
  return { type: "text", text: trimmed, preview };
}
