import type { StyleGuide } from '@/lib/types';
import { pickIndex } from './hash';

/**
 * Voice fillers. Deterministic (seeded by the answer id), capped by the style
 * guide, drawn only from the creator's approved list, and never stacked.
 */

export function injectFillers(text: string, style: StyleGuide, seed: string): string {
  const approved = (style.approved_fillers ?? []).filter((f) => f.trim().length > 0);
  const max = Math.max(0, Math.min(style.max_fillers_per_answer ?? 0, 1));
  if (approved.length === 0 || max === 0) return text;

  // Capped at one, and not on every answer: a filler on every line reads like a tic.
  if (pickIndex(seed, 3, 'filler-gate') !== 0) return text;
  const filler = approved[pickIndex(seed, approved.length, 'filler')].trim();
  // Never stack: if the answer already opens with an approved filler, leave it.
  const lower = text.toLowerCase();
  if (approved.some((f) => lower.startsWith(f.toLowerCase().replace(/[,.]$/, '')))) return text;

  const prefix = /[,.!?]$/.test(filler) ? filler : filler + ',';
  return prefix + ' ' + text;
}

export function stripBannedPhrases(text: string, style: StyleGuide): string {
  let out = text;
  for (const phrase of style.banned_phrases ?? []) {
    if (!phrase.trim()) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '');
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
}

export function countBanned(text: string, style: StyleGuide): string[] {
  const lower = text.toLowerCase();
  return (style.banned_phrases ?? []).filter((p) => p.trim() && lower.includes(p.toLowerCase()));
}

/** Sentence boundaries, without slicing decimals like 9.2 in half. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/** Split any sentence longer than the hint at its last comma or dash boundary. */
export function enforceSentenceLength(text: string, hint: number): string {
  if (!hint || hint <= 0) return text;
  const sentences = splitSentences(text);
  const out: string[] = [];
  for (const raw of sentences) {
    let sentence = raw.trim();
    if (!sentence) continue;
    let guard = 0;
    while (sentence.split(/\s+/).length > hint && guard < 4) {
      const words = sentence.split(/\s+/);
      let breakAt = -1;
      for (let i = 0; i < Math.min(hint, words.length); i += 1) {
        if (/[,—-]$/.test(words[i])) breakAt = i;
      }
      const cut = breakAt > 2 ? breakAt : Math.min(hint, words.length - 1);
      const head = words.slice(0, cut + 1).join(' ').replace(/[,—-]$/, '') + '.';
      out.push(head);
      sentence = words.slice(cut + 1).join(' ');
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      guard += 1;
    }
    if (sentence.trim()) out.push(sentence.trim());
  }
  return out.join(' ').replace(/\s{2,}/g, ' ').trim();
}

export function longestSentenceWords(text: string): number {
  const sentences = splitSentences(text);
  return sentences.reduce((max, s) => Math.max(max, s.trim().split(/\s+/).filter(Boolean).length), 0);
}
