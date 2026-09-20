import type {
  Condition,
  Constraints,
  Mode,
  RuleEffect,
  Situation,
  StyleGuide,
  UnitStatus,
  Verdict,
} from '@/lib/types';

/**
 * The router is a pure function of (snapshot, query). A snapshot is a plain,
 * already-parsed view of one creator's data — no DB handles, no promises.
 */

export interface CreatorView {
  id: string;
  slug: string;
  name: string;
  niche: string;
  disclosureText: string;
  replySecondsAvg: number | null;
  accent: string;
  styleGuide: StyleGuide;
}

export interface ItemView {
  id: string;
  creatorId: string;
  kind: string;
  name: string;
  priceGbp: number | null;
  attrs: Record<string, unknown>;
  isAvailable: boolean;
}

export interface UnitView {
  id: string;
  creatorId: string;
  itemId: string | null;
  mode: Mode;
  situation: Situation;
  verdict: Verdict;
  score: number | null;
  ruleId: string | null;
  ruleText: string;
  caveat: string;
  note: string;
  voiceSample: string | null;
  audioUrl: string | null;
  sourceRef: string;
  status: UnitStatus;
  priority: number;
}

export interface RuleView {
  id: string;
  creatorId: string;
  modeScope: Mode[];
  conditions: Condition[];
  effect: RuleEffect;
  ruleText: string;
  weight: number;
}

export interface TemplateView {
  id: string;
  creatorId: string;
  mode: Mode;
  slots: string[];
  text: string;
  audioKey: string;
}

export interface Snapshot {
  creator: CreatorView;
  items: ItemView[];
  units: UnitView[];
  rules: RuleView[];
  templates: TemplateView[];
}

export interface RouterInput {
  text?: string;
  chips?: string[];
  mode?: Mode | null;
  chipConstraints?: Constraints;
}
