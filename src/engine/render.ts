import type { Mode, StyleGuide } from '@/lib/types';
import type { TemplateView } from './snapshot';
import type { Pick } from './rank';
import { enforceSentenceLength, injectFillers, stripBannedPhrases } from './fillers';

/**
 * Step 9: rendering. Templates own the voice; the engine only fills slots.
 * A sentence containing an unfilled slot is dropped rather than printed with
 * "undefined" in it.
 */

export type Slots = Record<string, string | undefined>;

export function buildSlots(creatorName: string, picks: Pick[], extra: Slots = {}): Slots {
  const slots: Slots = { creator_name: creatorName, ...extra };
  picks.forEach((pick, index) => {
    const n = index + 1;
    const item = pick.item;
    slots[`pick${n}_name`] = item?.name;
    slots[`pick${n}_price`] = item?.priceGbp != null ? `£${item.priceGbp}` : undefined;
    slots[`pick${n}_score`] = pick.unit.score != null ? pick.unit.score.toFixed(1) : undefined;
    slots[`pick${n}_verdict`] = pick.unit.verdict ?? undefined;
    slots[`pick${n}_note`] = pick.unit.note || undefined;
    slots[`pick${n}_caveat`] = pick.unit.caveat || undefined;
    slots[`pick${n}_kind`] = item?.kind;
  });
  return slots;
}

const SLOT_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function templateSlots(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(SLOT_RE)) found.add(m[1]);
  return [...found].sort();
}

/** Required slots are the ones the template declares in its `slots` column. */
export function templateSatisfied(template: TemplateView, slots: Slots): boolean {
  return template.slots.every((slot) => {
    const value = slots[slot];
    return value !== undefined && value !== '';
  });
}

export function selectTemplate(
  templates: TemplateView[],
  mode: Mode,
  slots: Slots,
  preferredId: string | null,
): TemplateView | null {
  const forMode = templates.filter((t) => t.mode === mode).sort((a, b) => a.id.localeCompare(b.id));
  if (preferredId) {
    const preferred = forMode.find((t) => t.id === preferredId) ?? templates.find((t) => t.id === preferredId);
    if (preferred && templateSatisfied(preferred, slots)) return preferred;
  }
  return forMode.find((t) => templateSatisfied(t, slots)) ?? null;
}

/** Drop sentences that still reference an unfilled slot. */
export function fillTemplate(text: string, slots: Slots): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (const sentence of sentences) {
    let missing = false;
    const filled = sentence.replace(SLOT_RE, (_m, name: string) => {
      const value = slots[name];
      if (value === undefined || value === '') {
        missing = true;
        return '';
      }
      return value;
    });
    if (!missing && filled.trim()) kept.push(filled.trim());
  }
  const joined = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export interface RenderInput {
  template: TemplateView | null;
  slots: Slots;
  style: StyleGuide;
  seed: string;
  /** Used only when no template matched. */
  fallbackText: string;
}

export interface Rendered {
  text: string;
  templateId: string;
  audioKey: string;
}

export function render({ template, slots, style, seed, fallbackText }: RenderInput): Rendered {
  const raw = template ? fillTemplate(template.text, slots) : fallbackText;
  let text = raw.trim() || fallbackText;
  text = stripBannedPhrases(text, style);
  text = injectFillers(text, style, seed);
  text = enforceSentenceLength(text, style.sentence_length_hint);
  text = stripBannedPhrases(text, style);
  return {
    text,
    templateId: template?.id ?? 'fallback',
    audioKey: template?.audioKey ?? 'fallback',
  };
}
