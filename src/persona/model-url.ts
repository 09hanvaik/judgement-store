/**
 * A model is only usable if the renderer can drive its mouth. Kept out of
 * providers.ts so it can be validated without pulling in server-only code.
 */
export function looksLikeGlb(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return /\.glb(\?|$)/i.test(parsed.pathname + parsed.search) || /\.gltf(\?|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
