import type { SkipNote } from './types';

/** The one answer shape the card renders, wherever it is rendered. */
export interface CardPick {
  unitId: string;
  itemId: string | null;
  itemName: string | null;
  priceGbp: number | null;
  kind: string | null;
  verdict: string | null;
  score: number | null;
  note: string;
  caveat: string;
  voiceSample: string | null;
  sourceRef: string;
  ruleId: string | null;
  ruleText: string;
}

export interface CardCreator {
  slug: string;
  name: string;
  accent: string;
  disclosureText: string;
  niche: string;
}

export interface CardAnswer {
  id: string;
  creator: CardCreator;
  mode: string;
  renderedText: string;
  picks: CardPick[];
  firedRules: Array<{ id: string; text: string }>;
  skipNotes: SkipNote[];
  audioUrl: string | null;
}

export const VERDICT_LABEL: Record<string, string> = {
  buy: 'Buy',
  maybe: 'Maybe',
  no: 'No',
  pick: 'Her pick',
  skip: 'Skip',
};
