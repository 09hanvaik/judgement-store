import { createHash } from 'node:crypto';

/**
 * Answers are content-addressed: the same question asked twice returns the same
 * id, the same text and the same cached audio.
 */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',') + '}';
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export interface AnswerHashInput {
  creatorId: string;
  normalisedQuery: string;
  mode: string;
  constraints: unknown;
  unitIds: string[];
  templateId: string;
}

export function answerId(input: AnswerHashInput): string {
  const payload = stableStringify({
    creatorId: input.creatorId,
    mode: input.mode,
    query: input.normalisedQuery,
    constraints: input.constraints,
    units: [...input.unitIds].sort(),
    template: input.templateId,
  });
  return sha256(payload).slice(0, 10);
}

/** Deterministic 0..n-1 selector driven by an answer id. */
export function pickIndex(seed: string, n: number, salt = ''): number {
  if (n <= 0) return 0;
  const hex = sha256(seed + '|' + salt).slice(0, 8);
  return parseInt(hex, 16) % n;
}
