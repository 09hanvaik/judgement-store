import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The case files are the source of truth for seeded data. A few parts of them
 * (demo scripts, archetypes, the inbox examples) are presentation data rather
 * than judgement, so they are read here instead of being stored as rows.
 */

export interface DemoStep {
  label: string;
  text?: string;
  mode?: string;
  chips?: string[];
  /** Chip constraints this step sets, e.g. a tag or a referenced item. */
  constraints?: Record<string, unknown>;
}

export interface DemoScript {
  name: string;
  archetype: string;
  blurb: string;
  steps: DemoStep[];
}

export interface CaseFile {
  demos?: DemoScript[];
  archetypes?: Array<{ name: string; age: number; label: string; demo_text: string }>;
  inbox?: Array<{ text: string; expected_mode: string; expect_kind?: string; expect_signal?: string }>;
  creator?: { reply_seconds_note?: string; handle_summary?: string };
  [key: string]: unknown;
}

const cache = new Map<string, CaseFile | null>();

export function readCaseFile(slug: string): CaseFile | null {
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const path = resolve(`data/${slug}.json`);
  const value = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as CaseFile) : null;
  cache.set(slug, value);
  return value;
}
