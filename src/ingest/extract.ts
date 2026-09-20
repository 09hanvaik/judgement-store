import type { Mode, ProposedUnit, Verdict } from '@/lib/types';
import { segment } from './segment';

/**
 * Capture as a by-product. This is the ONLY place an LLM may be used, it runs
 * offline (never on the answer path), and it is optional: without a key the
 * heuristic extractor below does the same job with sentence patterns.
 *
 * Either way the creator's raw sentence is preserved verbatim as voice_sample,
 * every result is a candidate, and nothing is auto-approved.
 */

export interface ExtractInput {
  rawText: string;
  itemNames: Array<{ id: string; name: string }>;
}

export interface ExtractResult {
  units: ProposedUnit[];
  extractor: 'llm' | 'heuristic';
}

interface Pattern {
  re: RegExp;
  mode: Mode;
  verdict: Verdict;
  rule: (match: RegExpMatchArray) => string;
  asCaveat?: boolean;
}

const PATTERNS: Pattern[] = [
  {
    re: /\bi (?:would|'d) (?:definitely )?buy (?:it|this|that)? ?again\b/i,
    mode: 'verdict',
    verdict: 'buy',
    rule: () => 'She would buy it again, which is her strongest yes.',
  },
  {
    re: /\bi (?:would not|wouldn't|would never) (?:buy|pay|repurchase)\b/i,
    mode: 'verdict',
    verdict: 'no',
    rule: () => 'She would not buy it herself, whatever it scores.',
  },
  {
    re: /\b(?:not|isn't|is not) worth (?:it|the money|£\d+)/i,
    mode: 'verdict',
    verdict: 'no',
    rule: () => 'She says plainly it is not worth the money.',
  },
  {
    re: /\bworth (?:it|every penny|the money)\b/i,
    mode: 'verdict',
    verdict: 'buy',
    rule: () => 'She calls it worth it.',
  },
  {
    re: /\btoo (\w+)\b/i,
    mode: 'verdict',
    verdict: 'maybe',
    rule: (m) => `She stops short because it is too ${m[1]}.`,
    asCaveat: true,
  },
  {
    re: /\bbest with ([\w\s]+)/i,
    mode: 'adapt',
    verdict: 'pick',
    rule: (m) => `She pairs it with ${m[1].trim()}.`,
  },
  {
    re: /\bbest (?:for|on) ([\w\s]+)/i,
    mode: 'decide',
    verdict: 'pick',
    rule: (m) => `She sends this one for ${m[1].trim()}.`,
  },
  {
    re: /\b(?:i )?(?:would|'d) (?:only )?(?:buy|get|pick) (?:this|it)\b/i,
    mode: 'personal',
    verdict: 'buy',
    rule: () => 'This is what she would buy with her own money.',
  },
  {
    re: /\bi (?:do not|don't|never) recommend\b/i,
    mode: 'decide',
    verdict: 'no',
    rule: () => 'She does not recommend this one.',
  },
  {
    re: /\bunder £?(\d+)/i,
    mode: 'budget',
    verdict: null,
    rule: (m) => `She has a price line at £${m[1]} for this.`,
  },
];

const SCORE_RE = /\b(\d(?:\.\d)?)\s*(?:\/|out of)\s*10\b/i;
const PRICE_RE = /£\s?(\d+(?:\.\d+)?)/;

function matchItem(sentence: string, items: Array<{ id: string; name: string }>) {
  const lower = sentence.toLowerCase();
  const hit = items.find((item) => lower.includes(item.name.toLowerCase()));
  return hit ?? null;
}

/** Sentence-level "verdict + reason" patterns. No network, no model. */
export function heuristicExtract({ rawText, itemNames }: ExtractInput): ProposedUnit[] {
  const units: ProposedUnit[] = [];

  for (const sentence of segment(rawText)) {
    const item = matchItem(sentence, itemNames);
    const scoreMatch = sentence.match(SCORE_RE);
    const priceMatch = sentence.match(PRICE_RE);

    for (const pattern of PATTERNS) {
      const match = sentence.match(pattern.re);
      if (!match) continue;

      units.push({
        mode: pattern.mode,
        item_name: item?.name ?? null,
        item_id: item?.id ?? null,
        verdict: pattern.verdict,
        score: scoreMatch ? Number(scoreMatch[1]) : null,
        rule_text: pattern.rule(match),
        note: sentence.trim(),
        caveat: pattern.asCaveat ? sentence.trim() : '',
        // Her exact words, never rewritten.
        voice_sample: sentence.trim(),
        todo: item
          ? priceMatch && !item
            ? `Confirm the price £${priceMatch[1]} belongs to this item.`
            : null
          : 'No product in her list matches this sentence. Ask which one she means.',
      });
      break; // One unit per sentence: the strongest pattern wins.
    }
  }

  return units;
}

const SYSTEM_PROMPT = `You convert a creator's own words into structured judgement units.

Absolute rules:
- Never invent a product, price, score, verdict or quote. If it is not in the text, leave the field null.
- voice_sample must be the creator's exact sentence, copied character for character.
- note may only contain words from the source text.
- If a sentence contains no judgement, skip it. Returning fewer units is always correct.
- Every unit is a proposal for human review. You are not approving anything.

Return JSON only: {"units":[{"mode","item_name","verdict","score","rule_text","note","caveat","voice_sample","todo"}]}
mode is one of decide|budget|narrow|personal|constrain|adapt|verdict|route|lookup.
verdict is one of buy|maybe|no|pick|skip|null.`;

/** Optional LLM path. Offline ingestion only — never the runtime answer path. */
async function llmExtract({ rawText, itemNames }: ExtractInput): Promise<ProposedUnit[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Known products: ${itemNames.map((i) => i.name).join(', ') || '(none)'}\n\nTranscript:\n${rawText}`,
          },
        ],
      }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as { units?: ProposedUnit[] };
    if (!Array.isArray(parsed.units)) return null;

    const byName = new Map(itemNames.map((i) => [i.name.toLowerCase(), i.id]));
    return parsed.units
      // A unit whose voice_sample is not in the transcript was not said. Drop it.
      .filter((unit) => unit.voice_sample && rawText.includes(unit.voice_sample.trim()))
      .map((unit) => ({
        ...unit,
        item_id: unit.item_name ? (byName.get(unit.item_name.toLowerCase()) ?? null) : null,
      }));
  } catch {
    return null;
  }
}

export async function extract(input: ExtractInput): Promise<ExtractResult> {
  const viaLlm = await llmExtract(input);
  if (viaLlm && viaLlm.length > 0) return { units: viaLlm, extractor: 'llm' };
  return { units: heuristicExtract(input), extractor: 'heuristic' };
}
