import type { Constraints, Mode, Situation } from '@/lib/types';
import type { UnitView } from './snapshot';

/**
 * Step 4: keep the approved units whose `situation` is compatible with the
 * extracted constraints. Matching is typed predicates only — never free text.
 * A situation field that is absent means "applies to anything".
 */

function overlaps(situation: string[] | undefined, value: string | string[] | undefined): boolean {
  if (!situation || situation.length === 0) return true;
  if (value === undefined) return false;
  const values = Array.isArray(value) ? value : [value];
  return situation.some((s) => values.includes(s) || s === 'all');
}

export function situationMatches(situation: Situation, c: Constraints): boolean {
  if (situation.skin_type && situation.skin_type.length > 0) {
    if (!overlaps(situation.skin_type, c.skin_type)) return false;
  }
  if (situation.concern && situation.concern.length > 0) {
    if (!overlaps(situation.concern, c.concern)) return false;
  }
  if (situation.occasion && situation.occasion.length > 0) {
    if (!overlaps(situation.occasion, c.occasion)) return false;
  }
  if (situation.size && situation.size.length > 0) {
    if (!overlaps(situation.size, c.size)) return false;
  }
  if (situation.region && situation.region.length > 0) {
    if (!overlaps(situation.region, c.region)) return false;
  }
  if (situation.budget_max_gbp !== undefined && c.budget_gbp !== undefined) {
    // The unit only applies at or below the price ceiling it was written for.
    if (c.budget_gbp > situation.budget_max_gbp) return false;
  }
  if (situation.budget_min_gbp !== undefined && c.budget_gbp !== undefined) {
    if (c.budget_gbp < situation.budget_min_gbp) return false;
  }
  if (situation.time_minutes_max !== undefined) {
    if (c.time_minutes !== undefined && c.time_minutes > situation.time_minutes_max) return false;
  }
  if (situation.keyword_hits && situation.keyword_hits.length > 0) {
    const hits = c.keyword_hits ?? [];
    if (!situation.keyword_hits.some((k) => hits.includes(k))) return false;
  }
  return true;
}

/** Which modes a unit written for mode X may also serve. */
const MODE_COMPAT: Record<Mode, Mode[]> = {
  decide: ['decide', 'constrain', 'narrow', 'budget'],
  budget: ['budget'],
  narrow: ['narrow', 'decide'],
  personal: ['personal'],
  constrain: ['constrain', 'decide'],
  adapt: ['adapt'],
  verdict: ['verdict'],
  route: ['route'],
  lookup: ['lookup'],
  none: [],
};

export interface FilterResult {
  matched: UnitView[];
  /** Approved units for the mode that the constraints ruled out — used for skip notes. */
  nearMisses: UnitView[];
}

export function filterUnits(units: UnitView[], mode: Mode, constraints: Constraints): FilterResult {
  const inMode = units.filter(
    (u) => u.status === 'approved' && (MODE_COMPAT[u.mode] ?? []).includes(mode),
  );
  const matched: UnitView[] = [];
  const nearMisses: UnitView[] = [];
  for (const unit of inMode) {
    if (situationMatches(unit.situation, constraints)) matched.push(unit);
    else nearMisses.push(unit);
  }
  return { matched, nearMisses };
}

/** The constraint fields a unit declares it cannot be trusted without. */
export function missingRequirements(units: UnitView[], c: Constraints): string[] {
  const missing = new Set<string>();
  for (const unit of units) {
    for (const field of unit.situation.requires ?? []) {
      const value = (c as Record<string, unknown>)[field];
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
        missing.add(field);
      }
    }
  }
  return [...missing].sort();
}
