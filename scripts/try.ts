import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

import { loadSnapshot } from '../src/lib/snapshot';
import { route } from '../src/engine/router';
import type { Mode } from '../src/lib/types';

/**
 * Dev helper: ask the router a question from the terminal without the UI.
 *   npx tsx scripts/try.ts maya "i have dry skin and £60"
 */
async function main() {
  const [slug = 'maya', text = 'just tell me', mode] = process.argv.slice(2);
  const snapshot = await loadSnapshot(slug);
  if (!snapshot) throw new Error(`no creator ${slug}`);
  const result = route(snapshot, { text, mode: (mode as Mode) ?? null });
  console.dir(result, { depth: 6 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
