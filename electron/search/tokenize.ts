// Character trigrams for a lean "semantic fuzzy" layer.
// Not embeddings, but gives typo tolerance and partial-word matching that plain FTS5 misses.

export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function trigrams(s: string): Set<string> {
  const n = normalize(s);
  if (!n) return new Set();
  const padded = `  ${n} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

// Jaccard overlap of trigrams in [0,1].
export function trigramSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function escapeFtsQuery(q: string): string {
  const tokens = normalize(q).split(" ").filter(Boolean);
  if (!tokens.length) return "";
  return tokens.map((t) => `${t}*`).join(" OR ");
}
