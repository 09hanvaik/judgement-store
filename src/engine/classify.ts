import type { Mode } from '@/lib/types';
import type { Normalised } from './normalise';

/**
 * Step 2: layered mode classifier.
 *   Layer A — an explicit chip/mode from the UI wins outright.
 *   Layer B — ordered, weighted phrase patterns. Highest weight wins; ties go
 *             to the earlier entry in MODE_ORDER so the result is stable.
 *   Layer C — fallback handled by the router: `decide` when constraints were
 *             extracted, otherwise an ask_back.
 */

export interface Classification {
  mode: Mode;
  confidence: number;
  matched_patterns: string[];
  /** Set when Layer B found nothing; the router then applies Layer C. */
  fellBack: boolean;
  /** Only meaningful when mode === 'none'. */
  signal?: 'signal_trust' | 'signal_delayed_intent';
}

interface Pattern {
  id: string;
  mode: Mode;
  re: RegExp;
  weight: number;
  signal?: 'signal_trust' | 'signal_delayed_intent';
}

/** Tie-break order: the more specific intents first. */
const MODE_ORDER: Mode[] = [
  'none',
  'personal',
  'route',
  'adapt',
  'verdict',
  'lookup',
  'constrain',
  'narrow',
  'budget',
  'decide',
];

export const PATTERNS: Pattern[] = [
  // --- none: trust statements and delayed intent. Never answered, only logged.
  { id: 'none.trust', mode: 'none', re: /\bi trust you\b|\btrust you more than\b/, weight: 10, signal: 'signal_trust' },
  { id: 'none.first_account', mode: 'none', re: /first creator account where i actually/, weight: 10, signal: 'signal_trust' },
  { id: 'none.payday', mode: 'none', re: /\bbuying it (payday|next month|on payday|when i get paid)\b|\bbuying (it|this) (on )?payday\b/, weight: 10, signal: 'signal_delayed_intent' },
  { id: 'none.reopened', mode: 'none', re: /opened (this|it) \w+ times|still deciding\b/, weight: 10, signal: 'signal_delayed_intent' },
  { id: 'none.forward', mode: 'none', re: /sending (this|it) to my (sister|mum|mom|partner|friend|boyfriend|girlfriend)/, weight: 10, signal: 'signal_delayed_intent' },
  { id: 'none.saving', mode: 'none', re: /i (actually )?save everything\b/, weight: 9, signal: 'signal_trust' },

  // --- personal: "what would YOU do with your money".
  { id: 'personal.if_you_were_me', mode: 'personal', re: /if you were me\b|\bif it was you\b/, weight: 10 },
  { id: 'personal.your_money', mode: 'personal', re: /your (own )?money\b|if it was your money/, weight: 10 },
  { id: 'personal.what_would_you', mode: 'personal', re: /what would you (do|buy|get|pick|choose|keep)\b/, weight: 9 },
  { id: 'personal.the_one_you_would_buy', mode: 'personal', re: /the one you would buy\b|which one would you actually buy\b/, weight: 9 },
  { id: 'personal.you_actually_use', mode: 'personal', re: /what do you actually use\b/, weight: 9 },

  // --- route: ordered steps.
  { id: 'route.get_in', mode: 'route', re: /how do i get (in|into|there)\b|how do you get (in|into) (that|the) room\b/, weight: 10 },
  { id: 'route.first_days', mode: 'route', re: /first \d+ days\b|what do i actually do in the first\b/, weight: 10 },
  { id: 'route.break_in', mode: 'route', re: /\broute in\b|how do i break into\b|how do i get started\b/, weight: 9 },
  { id: 'route.steps', mode: 'route', re: /\bwhat are the steps\b|\bstep by step\b/, weight: 7 },

  // --- adapt: visitor already owns something.
  { id: 'adapt.already_have', mode: 'adapt', re: /i already (have|own|bought)\b/, weight: 10 },
  { id: 'adapt.wear_with', mode: 'adapt', re: /what should i wear with\b|what do i wear with\b/, weight: 10 },
  { id: 'adapt.goes_with', mode: 'adapt', re: /what goes with\b|how do i style\b/, weight: 9 },
  { id: 'adapt.change_it', mode: 'adapt', re: /how would you change (it|this)\b/, weight: 9 },
  { id: 'adapt.use_what_i_own', mode: 'adapt', re: /use what i (own|have)\b|stuff i (own|have)\b/, weight: 9 },
  { id: 'adapt.i_bought', mode: 'adapt', re: /\bi bought the\b/, weight: 8 },
  { id: 'adapt.i_live_in', mode: 'adapt', re: /\bi live in \w+/, weight: 7 },
  { id: 'adapt.what_next', mode: 'adapt', re: /\bwhat next\b|what should i (get|buy) next\b/, weight: 8 },

  // --- verdict: is X worth it.
  { id: 'verdict.cost_you', mode: 'verdict', re: /how much did (that|it|this) .*cost\b|what did (that|it) actually cost\b/, weight: 10 },
  { id: 'verdict.worth', mode: 'verdict', re: /\bworth (it|£|\d)|\bactually worth\b|\bis it worth\b/, weight: 9 },
  { id: 'verdict.buy_again', mode: 'verdict', re: /would you buy (it |that )?again\b/, weight: 9 },
  { id: 'verdict.influenced', mode: 'verdict', re: /am i being influenced\b|is this just hype\b/, weight: 9 },

  // --- lookup: exact item or fact.
  { id: 'lookup.what_shade', mode: 'lookup', re: /what shade\b|which shade\b/, weight: 9 },
  { id: 'lookup.where_is', mode: 'lookup', re: /\bwhere is\b|\bwhere are\b|where did you get\b|where can i (get|buy)\b|\bwhere from\b/, weight: 9 },
  { id: 'lookup.which_event', mode: 'lookup', re: /which event\b|what event\b/, weight: 9 },
  { id: 'lookup.what_wearing', mode: 'lookup', re: /what (are|were) you wearing\b|what is (this|that) (jacket|blazer|top|skirt|shoe)\b/, weight: 8 },
  { id: 'lookup.link', mode: 'lookup', re: /\blink to (this|that|it)\b|\bdrop the link\b/, weight: 7 },

  // --- constrain: exclusions and hard constraints.
  { id: 'constrain.allergy', mode: 'constrain', re: /\ballergic\b|\bfragrance\b|\bfragrance free\b|\bpregnan\w*/, weight: 9 },
  { id: 'constrain.size', mode: 'constrain', re: /what size\b|\bi am usually an? \d|\bsize \d|\bsizing\b/, weight: 9 },
  { id: 'constrain.sensitive', mode: 'constrain', re: /\bsensitive\b|\breactive skin\b/, weight: 8 },
  { id: 'constrain.skin_state', mode: 'constrain', re: /\b(dry|oily|combo|combination) skin\b|\bredness\b|\btexture\b|\bbreak(ing)? out\b/, weight: 8 },
  { id: 'constrain.skin_type_unknown', mode: 'constrain', re: /\bskin type\b/, weight: 7 },

  // --- narrow: cap the answer.
  { id: 'narrow.two_that_matter', mode: 'narrow', re: /two things that matter\b|the two things\b/, weight: 10 },
  { id: 'narrow.only_keep_one', mode: 'narrow', re: /only keep one\b|if you could only keep\b|\bonly one\b/, weight: 9 },
  { id: 'narrow.only_n', mode: 'narrow', re: /\bonly \d+ (products?|things?|items?|looks?|steps?)\b|\bonly (two|three) (products?|things?|items?)\b/, weight: 9 },
  { id: 'narrow.which_one', mode: 'narrow', re: /\bwhich one\b/, weight: 8 },
  { id: 'narrow.no_steps', mode: 'narrow', re: /\bi will not do \d+ steps\b|\bnot doing \d+ steps\b/, weight: 7 },

  // --- budget: price ceiling.
  { id: 'budget.under', mode: 'budget', re: /\bunder £?\d+|\bless than £?\d+|\bcheaper than £?\d+/, weight: 9 },
  { id: 'budget.cheaper', mode: 'budget', re: /\bcheaper\b|\bdupe\b|\bbudget version\b|\baffordable\b|\bnot paying\b/, weight: 8 },
  { id: 'budget.anything_like', mode: 'budget', re: /anything (like|similar to) (this|that)\b/, weight: 7 },

  // --- decide: just tell me.
  { id: 'decide.just_tell_me', mode: 'decide', re: /just tell me\b|\bpick for me\b|\bdecide for me\b/, weight: 9 },
  { id: 'decide.tell_me_what', mode: 'decide', re: /tell me what to (buy|get|do|use)\b|\bwhat should i buy\b/, weight: 7 },
  { id: 'decide.overwhelmed', mode: 'decide', re: /\b500 versions\b|\boverwhelmed\b|\btoo many options\b/, weight: 6 },
  { id: 'decide.help', mode: 'decide', re: /\bhelp\b/, weight: 4 },
];

export function classify(n: Normalised, explicitMode?: Mode | null): Classification {
  // Layer A.
  if (explicitMode) {
    return { mode: explicitMode, confidence: 1, matched_patterns: ['chip:' + explicitMode], fellBack: false };
  }

  // Layer B.
  const hits = PATTERNS.filter((p) => p.re.test(n.text));
  if (hits.length === 0) {
    return { mode: 'decide', confidence: 0, matched_patterns: [], fellBack: true };
  }

  let best = hits[0];
  for (const hit of hits) {
    if (hit.weight > best.weight) {
      best = hit;
      continue;
    }
    if (hit.weight === best.weight) {
      const a = MODE_ORDER.indexOf(hit.mode);
      const b = MODE_ORDER.indexOf(best.mode);
      if (a < b) best = hit;
    }
  }

  const totalWeight = hits.reduce((sum, h) => sum + h.weight, 0);
  const confidence = Math.min(1, Number((best.weight / Math.max(totalWeight, best.weight)).toFixed(3)));

  return {
    mode: best.mode,
    confidence,
    matched_patterns: hits.map((h) => h.id).sort(),
    fellBack: false,
    signal: best.mode === 'none' ? (best.signal ?? 'signal_trust') : undefined,
  };
}

/** Phrase ids available to rule conditions on `keyword_hits`. */
export function keywordHits(n: Normalised): string[] {
  return PATTERNS.filter((p) => p.re.test(n.text)).map((p) => p.id).sort();
}
