/**
 * Step 1 of the pipeline. Pure string work: no data access, no randomness.
 * Everything downstream reads `text` and `tokens`, never the raw input.
 */

export interface Normalised {
  raw: string;
  text: string;
  tokens: string[];
  /** Every £ / pounds / quid amount found, in order of appearance. */
  money: number[];
  /** Every "N minutes" style duration found, in minutes. */
  minutes: number[];
  /** Spelled-out or digit counts found next to "thing/product/item". */
  counts: number[];
}

const SLANG: Record<string, string> = {
  u: 'you',
  ur: 'your',
  pls: 'please',
  plz: 'please',
  bc: 'because',
  cos: 'because',
  cus: 'because',
  coz: 'because',
  tbh: 'to be honest',
  rn: 'right now',
  abt: 'about',
  wanna: 'want to',
  gonna: 'going to',
  gotta: 'got to',
  smth: 'something',
  sth: 'something',
  recs: 'recommendations',
  rec: 'recommendation',
  recc: 'recommendation',
  idk: 'i do not know',
  dont: 'do not',
  doesnt: 'does not',
  wouldnt: 'would not',
  cant: 'can not',
  im: 'i am',
  ive: 'i have',
  id: 'i would',
  youre: 'you are',
  whats: 'what is',
  wheres: 'where is',
  thats: 'that is',
  isnt: 'is not',
  aint: 'is not',
  lol: '',
  omg: '',
  pleaseeee: 'please',
  help: 'help',
};

const TYPOS: Record<string, string> = {
  recomend: 'recommend',
  recomendation: 'recommendation',
  reccomend: 'recommend',
  definately: 'definitely',
  skincar: 'skincare',
  skincare: 'skincare',
  wht: 'what',
  whre: 'where',
  wich: 'which',
  wat: 'what',
  actualy: 'actually',
  begging: 'begging',
  beggin: 'begging',
  foundatin: 'foundation',
  sensative: 'sensitive',
  sensetive: 'sensitive',
  moisturiser: 'moisturiser',
  moisturizer: 'moisturiser',
  serem: 'serum',
  worht: 'worth',
  wroth: 'worth',
  thnx: 'thanks',
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  sixty: 60,
};

function stripDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function normalise(input: string): Normalised {
  const raw = input ?? '';
  let text = stripDiacritics(raw.toLowerCase());

  // Collapse repeated punctuation and elongated letters ("HELPPPP" -> "help").
  text = text.replace(/([!?.,])\1+/g, '$1');
  text = text.replace(/([a-z])\1{2,}/g, '$1');

  // Money: pick up £60, 60 pounds, 60 quid, 60 gbp.
  const money: number[] = [];
  const moneyRe = /(?:£\s*(\d+(?:\.\d+)?))|(?:\b(\d+(?:\.\d+)?)\s*(?:pounds?|quid|gbp)\b)/g;
  for (const m of text.matchAll(moneyRe)) {
    const value = Number(m[1] ?? m[2]);
    if (Number.isFinite(value)) money.push(value);
  }

  // Durations: 5 mins, 5 minutes, five minutes, 5 min routine.
  const minutes: number[] = [];
  const minsRe = /\b([a-z]+|\d+)\s*(?:-\s*)?(?:mins?|minutes?)\b/g;
  for (const m of text.matchAll(minsRe)) {
    const token = m[1];
    const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    if (Number.isFinite(value)) minutes.push(value as number);
  }

  // Counts: "only 2 products", "two things", "only ONE of these".
  const counts: number[] = [];
  const countRe =
    /\b(?:only|just|exactly|max|maximum)?\s*(\d+|one|two|three|four|five)\s*(?:things?|products?|items?|steps?|picks?|of these|looks?)\b/g;
  for (const m of text.matchAll(countRe)) {
    const token = m[1];
    const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    if (Number.isFinite(value)) counts.push(value as number);
  }
  if (/\bonly\s+(?:keep\s+)?one\b|\bwhich\s+one\b|\bjust\s+one\b/.test(text)) counts.push(1);

  // Punctuation noise out, keep £ and decimals for downstream readability.
  const cleaned = text.replace(/[^a-z0-9£.\s+-]/g, ' ').replace(/\s+/g, ' ').trim();

  const tokens = cleaned
    .split(' ')
    .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ''))
    .map((t) => TYPOS[t] ?? t)
    .map((t) => (t in SLANG ? SLANG[t] : t))
    .flatMap((t) => t.split(' '))
    .filter((t) => t.length > 0);

  return { raw, text: tokens.join(' '), tokens, money, minutes, counts };
}
