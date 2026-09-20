import type { Constraints, Mode, SkipNote, Verdict } from '@/lib/types';
import type { ItemView, UnitView } from './snapshot';
import type { RuleOutcome } from './rules';

/**
 * Step 6 and 7: ranking and honest skip notes.
 * Order: within budget, then the creator's score / verdict strength, then her
 * priority, then a stable tie-break on id. No randomness anywhere.
 */

export const DEFAULT_CAPS: Record<Mode, number> = {
  decide: 1,
  narrow: 2,
  budget: 2,
  personal: 2,
  constrain: 2,
  adapt: 2,
  verdict: 2,
  route: 2,
  lookup: 2,
  none: 0,
};

export function verdictStrength(verdict: Verdict): number {
  switch (verdict) {
    case 'buy':
    case 'pick':
      return 9;
    case 'maybe':
      return 6;
    case 'skip':
      return 2;
    case 'no':
      return 0;
    default:
      return 5;
  }
}

export interface Pick {
  unit: UnitView;
  item: ItemView | null;
  withinBudget: boolean;
  effectiveScore: number;
}

export interface RankInput {
  units: UnitView[];
  items: ItemView[];
  constraints: Constraints;
  outcome: RuleOutcome;
  mode: Mode;
}

export interface RankResult {
  picks: Pick[];
  skipNotes: SkipNote[];
  cap: number;
}

/**
 * A price ceiling only filters where the visitor was shopping. "Is it worth
 * £38?" mentions a number without asking for anything under it.
 */
const BUDGET_MODES = new Set<Mode>(['decide', 'budget', 'narrow', 'constrain', 'personal', 'adapt']);

function withinBudget(item: ItemView | null, budget: number | undefined): boolean {
  if (budget === undefined) return true;
  if (!item || item.priceGbp === null) return true;
  return item.priceGbp <= budget;
}

export function rank({ units, items, constraints, outcome, mode }: RankInput): RankResult {
  const itemById = new Map(items.map((i) => [i.id, i]));

  const cap = outcome.cap ?? (constraints.wants_one ? 1 : DEFAULT_CAPS[mode]);
  const budget = BUDGET_MODES.has(mode) ? constraints.budget_gbp : undefined;

  const candidates: Pick[] = [];
  const skipNotes: SkipNote[] = [];

  for (const unit of units) {
    const item = unit.itemId ? itemById.get(unit.itemId) ?? null : null;

    if (unit.itemId && outcome.excludedItemIds.has(unit.itemId)) {
      const rule = outcome.exclusionReason.get(unit.itemId);
      skipNotes.push({
        item_id: unit.itemId,
        item_name: item?.name ?? unit.itemId,
        text: rule ? rule.ruleText : 'Ruled out by one of her rules.',
        rule_id: rule?.id ?? null,
      });
      continue;
    }

    if (item && item.isAvailable === false) {
      skipNotes.push({
        item_id: item.id,
        item_name: item.name,
        text: 'Not available right now, so she is not sending you there.',
        rule_id: null,
      });
      continue;
    }

    const inBudget = withinBudget(item, budget);
    if (!inBudget) {
      skipNotes.push({
        item_id: item?.id ?? null,
        item_name: item?.name ?? 'This one',
        text: `Over your £${budget} line${item?.priceGbp ? ` at £${item.priceGbp}` : ''} — she would not stretch for it here.`,
        rule_id: unit.ruleId,
      });
      continue;
    }

    const base = unit.score ?? verdictStrength(unit.verdict);
    const boost = outcome.boosts[unit.itemId ?? ''] ?? 0;
    const included = unit.itemId ? outcome.includedItemIds.includes(unit.itemId) : false;
    candidates.push({
      unit,
      item,
      withinBudget: inBudget,
      effectiveScore: Number((base + boost + (included ? 5 : 0)).toFixed(4)),
    });
  }

  candidates.sort((a, b) => {
    if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
    if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
    if (b.unit.priority !== a.unit.priority) return b.unit.priority - a.unit.priority;
    return a.unit.id.localeCompare(b.unit.id);
  });

  // De-duplicate by item so one item never fills both slots.
  const seen = new Set<string>();
  const picks: Pick[] = [];
  for (const candidate of candidates) {
    const key = candidate.unit.itemId ?? candidate.unit.id;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(candidate);
    if (picks.length >= cap) break;
  }

  // Anything her rules removed is named, even when no unit for it was in play —
  // "Good. Not £62 good." is the most useful thing she says about Glass Drop.
  const noted = new Set(skipNotes.map((note) => note.item_id).filter(Boolean) as string[]);
  for (const [itemId, rule] of outcome.exclusionReason) {
    if (noted.has(itemId)) continue;
    const item = itemById.get(itemId);
    if (!item) continue;
    skipNotes.push({
      item_id: itemId,
      item_name: item.name,
      text: rule.ruleText,
      rule_id: rule.id,
    });
    noted.add(itemId);
  }

  skipNotes.sort((a, b) => (a.item_name + a.text).localeCompare(b.item_name + b.text));

  // Per-item prices can each clear the ceiling while the basket does not. Say so.
  if (budget !== undefined && picks.length > 1) {
    const total = picks.reduce((sum, p) => sum + (p.item?.priceGbp ?? 0), 0);
    if (total > budget) {
      skipNotes.push({
        item_id: null,
        item_name: 'Both together',
        text: `Both is £${Number(total.toFixed(2))}, over your £${budget}. If £${budget} is the whole budget, start with ${picks[0].item?.name ?? 'the first one'}.`,
        rule_id: null,
      });
    }
  }

  return { picks, skipNotes, cap };
}
