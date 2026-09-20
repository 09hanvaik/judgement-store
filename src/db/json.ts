import type {
  AnswerQuery,
  CohortRow,
  Condition,
  ProposedUnit,
  RuleEffect,
  Situation,
  SkipNote,
  StyleGuide,
  Mode,
  VisitorContext,
} from '@/lib/types';

/**
 * JSON columns are TEXT. These helpers are the only sanctioned way in or out,
 * so a malformed row degrades to a safe default instead of throwing mid-render.
 */

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    const value = JSON.parse(raw) as T;
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export const parseStyleGuide = (raw: string): StyleGuide =>
  parse<StyleGuide>(raw, {
    tone: '',
    dos: [],
    donts: [],
    approved_fillers: [],
    max_fillers_per_answer: 0,
    sentence_length_hint: 18,
    banned_phrases: [],
    ask_back_questions: [],
  });

export const parseAttrs = (raw: string): Record<string, unknown> =>
  parse<Record<string, unknown>>(raw, {});

export const parseSituation = (raw: string): Situation => parse<Situation>(raw, {});

export const parseConditions = (raw: string): Condition[] => parse<Condition[]>(raw, []);

export const parseEffect = (raw: string): RuleEffect => parse<RuleEffect>(raw, {});

export const parseModeScope = (raw: string): Mode[] => parse<Mode[]>(raw, []);

export const parseStringArray = (raw: string): string[] => parse<string[]>(raw, []);

export const parseAnswerQuery = (raw: string): AnswerQuery =>
  parse<AnswerQuery>(raw, { mode: 'decide', raw_text: '', chips: [], constraints: {} });

export const parseSkipNotes = (raw: string): SkipNote[] => parse<SkipNote[]>(raw, []);

export const parseVisitorContext = (raw: string): VisitorContext =>
  parse<VisitorContext>(raw, {});

export const parseCohortRow = (raw: string): CohortRow =>
  parse<CohortRow>(raw, {
    label: 'unknown',
    saves: 0,
    shares: 0,
    returns: 0,
    converted: false,
    lag_days: null,
  });

export const parseProposedUnit = (raw: string): ProposedUnit =>
  parse<ProposedUnit>(raw, {
    mode: 'decide',
    item_name: null,
    item_id: null,
    verdict: null,
    score: null,
    rule_text: '',
    note: '',
    caveat: '',
    voice_sample: '',
  });

export const parsePayload = (raw: string): Record<string, unknown> =>
  parse<Record<string, unknown>>(raw, {});
