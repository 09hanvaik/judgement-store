import { readFileSync } from 'node:fs';
import { loadSnapshot } from '@/lib/snapshot';
import type { Snapshot } from '@/engine/snapshot';

export interface InboxCase {
  text: string;
  expected_mode: string;
  expect_kind?: string;
  expect_signal?: string;
}

export function caseFile(slug: string): {
  inbox: InboxCase[];
  items: Array<{ id: string; name: string }>;
  rules: Array<{ id: string }>;
  templates: Array<{ id: string }>;
  case_stats: Array<{ stat: string; value: string; source_ref: string }>;
  cohort: { rows: unknown[]; source_ref: string; label: string };
} {
  return JSON.parse(readFileSync(`data/${slug}.json`, 'utf8'));
}

const cache = new Map<string, Snapshot>();

export async function snapshot(slug: string): Promise<Snapshot> {
  const cached = cache.get(slug);
  if (cached) return cached;
  const loaded = await loadSnapshot(slug);
  if (!loaded) throw new Error(`no snapshot for ${slug}`);
  cache.set(slug, loaded);
  return loaded;
}

export const SLUGS = ['maya', 'sofia', 'aditi'] as const;
