import type { Constraints } from '@/lib/types';
import type { Normalised } from './normalise';
import { keywordHits } from './classify';

/**
 * Step 3: constraint extraction. Chips always win over free text, because a
 * chip is something the visitor deliberately said.
 */

export interface ItemRef {
  id: string;
  name: string;
}

const SKIN_TYPES: Record<string, string> = {
  dry: 'dry',
  oily: 'oily',
  combo: 'combo',
  combination: 'combo',
  sensitive: 'sensitive',
  reactive: 'sensitive',
  normal: 'normal',
};

const CONCERNS: Record<string, string> = {
  redness: 'redness',
  red: 'redness',
  texture: 'texture',
  bumpy: 'texture',
  acne: 'acne',
  breakouts: 'acne',
  breakout: 'acne',
  dullness: 'dullness',
  dull: 'dullness',
  pores: 'pores',
  irritation: 'irritation',
  irritated: 'irritation',
  angry: 'irritation',
};

const OCCASIONS: Array<[RegExp, string]> = [
  [/first date/, 'first date'],
  [/\bdate night\b/, 'date night'],
  [/\bwedding\b/, 'wedding'],
  [/\bholiday\b|\bvacation\b/, 'holiday'],
  [/\bwork\b|\boffice\b/, 'work'],
  [/\bparty\b/, 'party'],
  [/\bgym\b/, 'gym'],
  [/\bon camera\b|\bvideo\b|\bfilming\b/, 'camera'],
  [/\binterview\b/, 'interview'],
];

const REGIONS: Array<[RegExp, string]> = [
  [/\blondon\b/, 'london'],
  [/\buk\b/, 'uk'],
  [/\bus\b|\bstates\b/, 'us'],
  [/\beu\b|\beurope\b/, 'eu'],
];

/** Tokens that carry no matching signal when fuzzy-matching item names. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'your', 'this', 'that', 'and', 'or', 'of', 'in', 'on', 'i', 'it',
  'do', 'not', 'have', 'has', 'own', 'bought', 'already', 'need', 'too', 'with', 'what',
  'should', 'wear', 'them', 'to', 'is', 'are', 'you', 'me', 'for', 'but', 'so', 'if',
]);

/** Conservative fuzzy match: an item is "owned" only if a distinctive word of its name appears. */
export function matchOwnedItems(n: Normalised, items: ItemRef[]): string[] {
  const text = ' ' + n.text + ' ';
  const owned: string[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    if (text.includes(' ' + name + ' ')) {
      owned.push(item.id);
      continue;
    }
    const words = name.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
    // Every distinctive word of the item name must be present.
    if (words.length > 0 && words.every((w) => text.includes(' ' + w))) owned.push(item.id);
  }
  return owned.sort();
}

export interface ExtractInput {
  normalised: Normalised;
  items: ItemRef[];
  chips?: Constraints;
}

export function extractConstraints({ normalised: n, items, chips }: ExtractInput): Constraints {
  const out: Constraints = {};

  // Budget: an explicit ceiling ("under £60") beats a bare amount.
  const ceiling = n.text.match(/(?:under|below|less than|cheaper than|max|up to)\s*£?\s*(\d+(?:\.\d+)?)/);
  if (ceiling) out.budget_gbp = Number(ceiling[1]);
  else if (n.money.length > 0) out.budget_gbp = Math.max(...n.money);

  if (n.minutes.length > 0) out.time_minutes = Math.min(...n.minutes);

  for (const token of n.tokens) {
    if (!out.skin_type && SKIN_TYPES[token] && / skin|skin /.test(n.text)) {
      out.skin_type = SKIN_TYPES[token];
    }
  }
  // "sensitive" / "oily" often appear without the word "skin" right beside them.
  if (!out.skin_type) {
    for (const token of n.tokens) {
      if (SKIN_TYPES[token] && token !== 'normal' && token !== 'dry') out.skin_type = SKIN_TYPES[token];
      if (out.skin_type) break;
    }
  }

  const concerns = new Set<string>();
  for (const token of n.tokens) {
    const concern = CONCERNS[token];
    if (concern) concerns.add(concern);
  }
  if (concerns.size > 0) out.concern = [...concerns].sort();

  for (const [re, value] of OCCASIONS) {
    if (re.test(n.text)) {
      out.occasion = value;
      break;
    }
  }

  const size = n.text.match(/\b(?:uk\s*)?size\s*(\d+|xs|s|m|l|xl)\b/) ?? n.text.match(/\bi am usually an? (\d+)\b/);
  if (size) out.size = size[1];

  for (const [re, value] of REGIONS) {
    if (re.test(n.text)) {
      out.region = value;
      break;
    }
  }

  const owned = matchOwnedItems(n, items);
  if (owned.length > 0) out.owned_item_ids = owned;

  if (n.counts.includes(1)) out.wants_one = true;

  out.keyword_hits = keywordHits(n);

  // Chips win on conflict.
  if (chips) {
    for (const [key, value] of Object.entries(chips)) {
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) continue;
      (out as Record<string, unknown>)[key] = value;
    }
  }

  return out;
}
