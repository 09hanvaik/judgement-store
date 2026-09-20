import type { Condition, Constraints, Mode } from '@/lib/types';
import type { ItemView, RuleView } from './snapshot';

/**
 * Step 5: the rule engine. Rules are sorted by weight (high first) and applied
 * in a fixed order — exclusions before includes and boosts — so the same input
 * always produces the same fired-rule list.
 */

export interface RuleContext {
  mode: Mode;
  constraints: Constraints;
}

function fieldValue(field: Condition['field'], ctx: RuleContext): unknown {
  if (field === 'mode') return ctx.mode;
  return (ctx.constraints as Record<string, unknown>)[field];
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function evaluateCondition(condition: Condition, ctx: RuleContext): boolean {
  const actual = fieldValue(condition.field, ctx);
  const expected = condition.value;

  switch (condition.op) {
    case 'exists': {
      const present =
        actual !== undefined &&
        actual !== null &&
        !(Array.isArray(actual) && actual.length === 0) &&
        actual !== '';
      return expected === false ? !present : present;
    }
    case 'eq':
      return actual === expected;
    case 'in': {
      if (!Array.isArray(expected)) return false;
      if (Array.isArray(actual)) return actual.some((a) => expected.includes(a));
      return expected.includes(actual as never);
    }
    case 'contains': {
      if (Array.isArray(actual)) return actual.includes(expected as never);
      if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected);
      return false;
    }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return false;
      if (condition.op === 'lt') return a < b;
      if (condition.op === 'lte') return a <= b;
      if (condition.op === 'gt') return a > b;
      return a >= b;
    }
    default:
      return false;
  }
}

export function ruleApplies(rule: RuleView, ctx: RuleContext): boolean {
  if (rule.modeScope.length > 0 && !rule.modeScope.includes(ctx.mode)) return false;
  return rule.conditions.every((c) => evaluateCondition(c, ctx));
}

export interface RuleOutcome {
  fired: RuleView[];
  excludedItemIds: Set<string>;
  includedItemIds: string[];
  boosts: Record<string, number>;
  askBack: { question: string; rule: RuleView } | null;
  templateId: string | null;
  cap: number | null;
  /** Why each item was excluded, for honest skip notes. */
  exclusionReason: Map<string, RuleView>;
}

export function applyRules(allRules: RuleView[], items: ItemView[], ctx: RuleContext): RuleOutcome {
  const sorted = [...allRules].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  const fired = sorted.filter((r) => ruleApplies(r, ctx));

  const excludedItemIds = new Set<string>();
  const exclusionReason = new Map<string, RuleView>();
  const includedItemIds: string[] = [];
  const boosts: Record<string, number> = {};
  let askBack: RuleOutcome['askBack'] = null;
  let templateId: string | null = null;
  let cap: number | null = null;

  // Pass 1 — exclusions always win, and they run before anything can include.
  for (const rule of fired) {
    for (const id of rule.effect.exclude_item_ids ?? []) {
      if (!excludedItemIds.has(id)) {
        excludedItemIds.add(id);
        exclusionReason.set(id, rule);
      }
    }
    const excludeAttrs = rule.effect.exclude_attrs ?? {};
    for (const [key, value] of Object.entries(excludeAttrs)) {
      for (const item of items) {
        const attr = item.attrs[key];
        const hit = Array.isArray(value) ? value.includes(attr as never) : attr === value;
        if (hit && !excludedItemIds.has(item.id)) {
          excludedItemIds.add(item.id);
          exclusionReason.set(item.id, rule);
        }
      }
    }
  }

  // Pass 2 — includes, boosts, ask_back, template and cap.
  for (const rule of fired) {
    for (const id of rule.effect.include_item_ids ?? []) {
      if (!excludedItemIds.has(id) && !includedItemIds.includes(id)) includedItemIds.push(id);
    }
    for (const [id, amount] of Object.entries(rule.effect.boost ?? {})) {
      if (excludedItemIds.has(id)) continue;
      boosts[id] = (boosts[id] ?? 0) + amount;
    }
    if (!askBack && rule.effect.ask_back) askBack = { question: rule.effect.ask_back, rule };
    if (!templateId && rule.effect.template_id) templateId = rule.effect.template_id;
    if (cap === null && rule.effect.cap !== undefined && rule.effect.cap !== null) cap = rule.effect.cap;
  }

  return { fired, excludedItemIds, includedItemIds, boosts, askBack, templateId, cap, exclusionReason };
}
