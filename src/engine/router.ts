import type { AnswerQuery, AskBackOption, Constraints, Mode, SkipNote } from '@/lib/types';
import { normalise, type Normalised } from './normalise';
import { classify, type Classification } from './classify';
import { extractConstraints } from './constraints';
import { filterUnits, missingRequirements } from './filter';
import { applyRules, type RuleOutcome } from './rules';
import { rank, type Pick } from './rank';
import { buildSlots, render, selectTemplate } from './render';
import { answerId } from './hash';
import type { ItemView, RouterInput, RuleView, Snapshot, UnitView } from './snapshot';

/**
 * The whole answer path, as one pure function of (snapshot, input).
 * No IO, no clock, no randomness — so it is unit-testable and offline-safe.
 */

export interface FiredRule {
  id: string;
  text: string;
}

export interface RenderedPick {
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

export interface RouterAnswer {
  id: string;
  creatorId: string;
  query: AnswerQuery;
  picks: RenderedPick[];
  unitIds: string[];
  itemIds: string[];
  ruleIds: string[];
  firedRules: FiredRule[];
  renderedText: string;
  skipNotes: SkipNote[];
  templateId: string;
  audioKey: string;
}

export type RouterResult =
  | {
      kind: 'answer';
      mode: Mode;
      confidence: number;
      matchedPatterns: string[];
      constraints: Constraints;
      answer: RouterAnswer;
    }
  | {
      kind: 'ask_back';
      mode: Mode;
      confidence: number;
      matchedPatterns: string[];
      constraints: Constraints;
      askBack: {
        question: string;
        ruleId: string | null;
        ruleText: string;
        options: AskBackOption[];
      };
    }
  | {
      kind: 'signal';
      mode: 'none';
      confidence: number;
      matchedPatterns: string[];
      constraints: Constraints;
      signal: { type: 'signal_trust' | 'signal_delayed_intent'; text: string; offerSave: boolean };
    }
  | {
      kind: 'no_match';
      mode: Mode;
      confidence: number;
      matchedPatterns: string[];
      constraints: Constraints;
      noMatch: { text: string; question: string | null };
    };

const ASK_BACK_COPY: Record<string, string> = {
  skin_type: 'Skin type?',
  budget_gbp: 'Budget?',
  occasion: 'What is it for?',
  size: 'What size are you usually?',
  owned_item_ids: 'What are you using now?',
  concern: 'What do you hate about it?',
  time_minutes: 'How many minutes will you actually give this?',
};

/** The one fact a mode cannot run without. Anything else is optional. */
const MODE_REQUIREMENTS: Partial<Record<Mode, string>> = {
  budget: 'budget_gbp',
  adapt: 'owned_item_ids',
};

/** Modes where naming an item means "tell me about this one". */
const REFERENCE_MODES = new Set<Mode>(['lookup', 'verdict']);

const OWNED_RULE = (creatorId: string): RuleView => ({
  id: 'R-CORE-OWNED',
  creatorId,
  modeScope: ['adapt'],
  conditions: [],
  effect: {},
  ruleText: 'She never re-sells you something you already own.',
  weight: 0,
});

const REFERENCE_RULE = (creatorId: string): RuleView => ({
  id: 'R-CORE-REFERENCED',
  creatorId,
  modeScope: ['lookup', 'verdict'],
  conditions: [],
  effect: {},
  ruleText: 'You named a specific thing, so the answer is about that thing and nothing else.',
  weight: 0,
});

function questionOptions(questions: string[], exclude?: string): AskBackOption[] {
  const normalise = (value: string) => value.trim().toLowerCase().replace(/[?.!]+$/, '');
  return questions
    .filter((q) => !exclude || normalise(q) !== normalise(exclude))
    .slice(0, 2)
    .map((label) => ({ label }));
}

/**
 * A refusal is still her speaking. The copy is authored per creator in her
 * style guide; these are only the fallbacks for a creator who has not set any.
 */
function signalText(
  type: 'signal_trust' | 'signal_delayed_intent',
  creator: Snapshot['creator'],
): string {
  const voice = creator.styleGuide.voice;
  if (type === 'signal_trust') {
    return (
      voice?.trust ??
      `That means a lot. Nothing to decide here — ${creator.name}'s picks stay where you left them.`
    );
  }
  return voice?.delayed_intent ?? 'No rush. It will be here when you come back to it.';
}

export function route(snapshot: Snapshot, input: RouterInput): RouterResult {
  const { creator, items, units, rules, templates } = snapshot;
  const rawText = (input.text ?? '').trim();
  const n: Normalised = normalise(rawText);

  const classification: Classification = classify(n, input.mode ?? null);
  const constraints: Constraints = extractConstraints({
    normalised: n,
    items: items.map((i) => ({ id: i.id, name: i.name })),
    chips: input.chipConstraints,
  });

  // Layer C: nothing matched and nothing extracted — ask her one question.
  const hasConstraint = Boolean(
    constraints.skin_type ||
      constraints.budget_gbp !== undefined ||
      constraints.occasion ||
      constraints.size ||
      constraints.time_minutes !== undefined ||
      (constraints.concern?.length ?? 0) > 0 ||
      (constraints.owned_item_ids?.length ?? 0) > 0,
  );

  const base = {
    mode: classification.mode,
    confidence: classification.confidence,
    matchedPatterns: classification.matched_patterns,
    constraints,
  };

  if (classification.mode === 'none') {
    const type = classification.signal ?? 'signal_trust';
    return {
      kind: 'signal',
      mode: 'none',
      confidence: classification.confidence,
      matchedPatterns: classification.matched_patterns,
      constraints,
      signal: {
        type,
        text: signalText(type, creator),
        offerSave: type === 'signal_delayed_intent',
      },
    };
  }

  if (classification.fellBack && !hasConstraint && rawText.length > 0) {
    const question =
      creator.styleGuide.filter_question ??
      creator.styleGuide.voice?.vague ??
      creator.styleGuide.ask_back_questions[0] ??
      'Tell me a bit more and I will point you at one thing.';
    return {
      kind: 'ask_back',
      ...base,
      askBack: {
        question,
        ruleId: null,
        ruleText: `${creator.name} would rather ask one question than guess at an answer.`,
        // Never offer the question back to itself as a reply.
        options: questionOptions(creator.styleGuide.ask_back_questions, question),
      },
    };
  }

  const mode = classification.mode;
  const ctx = { mode, constraints };
  const outcome: RuleOutcome = applyRules(rules, items, ctx);

  // Two structural rules that belong to the engine, not to any one creator.
  // They are surfaced as fired rules so nothing about them is hidden.
  const referenced = constraints.owned_item_ids ?? [];
  if (REFERENCE_MODES.has(mode)) {
    // "Is the Cloud Cream worth it" is a question about that item, not a shortlist.
    for (const id of referenced) outcome.boosts[id] = (outcome.boosts[id] ?? 0) + 20;
    if (referenced.length > 0) outcome.fired.push(REFERENCE_RULE(creator.id));
  }
  if (mode === 'adapt') {
    for (const id of referenced) {
      if (outcome.excludedItemIds.has(id)) continue;
      outcome.excludedItemIds.add(id);
      outcome.exclusionReason.set(id, OWNED_RULE(creator.id));
    }
    if (referenced.length > 0) outcome.fired.push(OWNED_RULE(creator.id));
  }

  // A rule may demand a clarifying question before anything is recommended.
  if (outcome.askBack) {
    return {
      kind: 'ask_back',
      ...base,
      askBack: {
        question: outcome.askBack.question,
        ruleId: outcome.askBack.rule.id,
        ruleText: outcome.askBack.rule.ruleText,
        options: outcome.askBack.rule.effect.ask_back_options ?? [],
      },
    };
  }

  const { matched, nearMisses } = filterUnits(units, mode, constraints);

  // Some modes are meaningless without one fact. Ask for it rather than guess.
  const modeRequirement = MODE_REQUIREMENTS[mode];
  // A rule that already named something has answered the question for us.
  const modeRequirementMissing =
    modeRequirement !== undefined &&
    outcome.includedItemIds.length === 0 &&
    ((constraints as Record<string, unknown>)[modeRequirement] === undefined ||
      (Array.isArray((constraints as Record<string, unknown>)[modeRequirement]) &&
        ((constraints as Record<string, unknown>)[modeRequirement] as unknown[]).length === 0));

  const missing = modeRequirementMissing
    ? [modeRequirement, ...missingRequirements(matched, constraints)]
    : missingRequirements(matched, constraints);
  if (missing.length > 0) {
    const field = missing[0];
    return {
      kind: 'ask_back',
      ...base,
      askBack: {
        question: ASK_BACK_COPY[field] ?? creator.styleGuide.ask_back_questions[0] ?? 'Tell me one more thing?',
        ruleId: null,
        ruleText: `She will not recommend blind: ${field.replace(/_/g, ' ')} decides the answer here.`,
        options: [],
      },
    };
  }

  const ranked = rank({ units: matched, items, constraints, outcome, mode });

  if (ranked.picks.length === 0) {
    const question = creator.styleGuide.ask_back_questions[0] ?? null;
    const extraSkips = buildNearMissNotes(nearMisses, items, outcome);
    return {
      kind: 'no_match',
      ...base,
      noMatch: {
        text:
          creator.styleGuide.voice?.no_match ??
          `${creator.name} has not made that call yet, and would rather say so than guess.`,
        question: extraSkips.length > 0 ? null : question,
      },
    };
  }

  const picks = ranked.picks;
  const query: AnswerQuery = {
    mode,
    raw_text: rawText,
    chips: input.chips ?? [],
    constraints,
  };

  const slots = buildSlots(creator.name, picks, {
    budget: constraints.budget_gbp !== undefined ? `£${constraints.budget_gbp}` : undefined,
    occasion: constraints.occasion,
    skin_type: constraints.skin_type,
    // Guard slot: templates that speak about sensitive skin only render when it is.
    sensitive_flag: constraints.skin_type === 'sensitive' ? 'sensitive' : undefined,
    time_minutes: constraints.time_minutes !== undefined ? String(constraints.time_minutes) : undefined,
    owned_name: ownedName(constraints, items),
    rule_text: outcome.fired[0]?.ruleText ?? picks[0].unit.ruleText,
  });

  const template = selectTemplate(templates, mode, slots, outcome.templateId);

  const unitIds = picks.map((p) => p.unit.id);
  const id = answerId({
    creatorId: creator.id,
    normalisedQuery: n.text,
    mode,
    constraints: stripVolatile(constraints),
    unitIds,
    templateId: template?.id ?? 'fallback',
  });

  const fallbackText = defaultText(creator.name, picks);
  const rendered = render({ template, slots, style: creator.styleGuide, seed: id, fallbackText });

  // The rule that decided the pick leads; the other rules that fired follow.
  const firedRules = dedupeRules([
    ...picks
      .filter((p) => p.unit.ruleId)
      .map((p) => ({ id: p.unit.ruleId as string, text: p.unit.ruleText })),
    ...outcome.fired.map((r) => ({ id: r.id, text: r.ruleText })),
  ]);

  return {
    kind: 'answer',
    ...base,
    answer: {
      id,
      creatorId: creator.id,
      query,
      picks: picks.map(toRenderedPick),
      unitIds,
      itemIds: picks.map((p) => p.item?.id).filter((x): x is string => Boolean(x)),
      ruleIds: firedRules.map((r) => r.id),
      firedRules,
      renderedText: rendered.text,
      skipNotes: ranked.skipNotes,
      templateId: rendered.templateId,
      audioKey: rendered.audioKey,
    },
  };
}

function toRenderedPick(pick: Pick): RenderedPick {
  return {
    unitId: pick.unit.id,
    itemId: pick.unit.itemId,
    itemName: pick.item?.name ?? null,
    priceGbp: pick.item?.priceGbp ?? null,
    kind: pick.item?.kind ?? null,
    verdict: pick.unit.verdict,
    score: pick.unit.score,
    note: pick.unit.note,
    caveat: pick.unit.caveat,
    voiceSample: pick.unit.voiceSample,
    sourceRef: pick.unit.sourceRef,
    ruleId: pick.unit.ruleId,
    ruleText: pick.unit.ruleText,
  };
}

function dedupeRules(rules: FiredRule[]): FiredRule[] {
  const seen = new Set<string>();
  const out: FiredRule[] = [];
  for (const rule of rules) {
    if (!rule.id || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push(rule);
  }
  // Always-on guards stay visible, but below the rule that actually decided this.
  return out.sort((a, b) => Number(a.id.includes('GUARD')) - Number(b.id.includes('GUARD')));
}

function ownedName(constraints: Constraints, items: ItemView[]): string | undefined {
  const id = constraints.owned_item_ids?.[0];
  if (!id) return undefined;
  return items.find((i) => i.id === id)?.name;
}

/** keyword_hits are derived, not stated — they stay out of the answer id. */
function stripVolatile(constraints: Constraints): Omit<Constraints, 'keyword_hits'> {
  const { keyword_hits: _ignored, ...rest } = constraints;
  return rest;
}

function defaultText(name: string, picks: Pick[]): string {
  const first = picks[0];
  const price = first.item?.priceGbp != null ? ` (£${first.item.priceGbp})` : '';
  const score = first.unit.score != null ? `, ${first.unit.score.toFixed(1)}/10` : '';
  const head = first.item?.name ?? 'This one';
  return `${head}${price}${score}. ${first.unit.note || `${name} stands behind this one.`}`;
}

function buildNearMissNotes(nearMisses: UnitView[], items: ItemView[], outcome: RuleOutcome): SkipNote[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return nearMisses
    .filter((u) => u.itemId && outcome.excludedItemIds.has(u.itemId))
    .map((u) => ({
      item_id: u.itemId,
      item_name: byId.get(u.itemId as string)?.name ?? '',
      text: outcome.exclusionReason.get(u.itemId as string)?.ruleText ?? u.ruleText,
      rule_id: u.ruleId,
    }));
}
