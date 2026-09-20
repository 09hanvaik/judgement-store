/**
 * Voice notes arrive as one unpunctuated block as often as not, so segmentation
 * falls back to conjunctions and line breaks before giving up.
 */
export function segment(raw: string): string[] {
  const text = (raw ?? '').replace(/\r/g, '').trim();
  if (!text) return [];

  const byPunctuation = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const chunk of byPunctuation) {
    if (chunk.split(/\s+/).length <= 32) {
      out.push(chunk);
      continue;
    }
    // Long run-on: split on the connectives people actually speak in.
    const parts = chunk
      .split(/\s+(?:and then|but then|and also|so then|,\s*and|,\s*but)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push(...parts);
  }
  return out;
}
