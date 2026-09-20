/**
 * Character alignment -> viseme timeline.
 *
 * ElevenLabs returns per-character start and end times alongside the audio, so
 * the mouth shapes are derived from the real utterance rather than guessed from
 * word counts. This module is pure and shared by the generator script and the
 * renderer, so what is baked offline and what plays in the browser cannot drift.
 */

/** ARKit-style blendshape names present on Ready Player Me heads. */
export type Viseme =
  | 'viseme_sil'
  | 'viseme_PP'
  | 'viseme_FF'
  | 'viseme_TH'
  | 'viseme_DD'
  | 'viseme_kk'
  | 'viseme_CH'
  | 'viseme_SS'
  | 'viseme_nn'
  | 'viseme_RR'
  | 'viseme_aa'
  | 'viseme_E'
  | 'viseme_I'
  | 'viseme_O'
  | 'viseme_U';

export interface VisemeFrame {
  /** Seconds from the start of the clip. */
  t: number;
  v: Viseme;
  /** 0..1 — how open the shape is. Vowels carry more than consonants. */
  w: number;
}

export interface VisemeTrack {
  answerId: string;
  audioUrl: string;
  durationSec: number;
  frames: VisemeFrame[];
  source: 'elevenlabs' | 'estimated';
}

/** Letter -> viseme. Deliberately coarse: stylised reads better than uncanny. */
const LETTER_VISEME: Record<string, Viseme> = {
  a: 'viseme_aa', á: 'viseme_aa',
  e: 'viseme_E', é: 'viseme_E',
  i: 'viseme_I', y: 'viseme_I',
  o: 'viseme_O', ó: 'viseme_O',
  u: 'viseme_U', w: 'viseme_U',
  p: 'viseme_PP', b: 'viseme_PP', m: 'viseme_PP',
  f: 'viseme_FF', v: 'viseme_FF',
  t: 'viseme_DD', d: 'viseme_DD',
  k: 'viseme_kk', g: 'viseme_kk', c: 'viseme_kk', q: 'viseme_kk', x: 'viseme_kk',
  s: 'viseme_SS', z: 'viseme_SS',
  n: 'viseme_nn',
  l: 'viseme_nn',
  r: 'viseme_RR',
  j: 'viseme_CH',
  h: 'viseme_sil',
};

const VOWELS = new Set(['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U']);

/** "th" and "ch"/"sh" are digraphs: the pair decides the shape, not the letter. */
function digraph(prev: string, current: string): Viseme | null {
  if (prev === 't' && current === 'h') return 'viseme_TH';
  if (prev === 'c' && current === 'h') return 'viseme_CH';
  if (prev === 's' && current === 'h') return 'viseme_CH';
  return null;
}

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export function alignmentToVisemes(alignment: Alignment): VisemeFrame[] {
  const frames: VisemeFrame[] = [];
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;

  let previous = '';
  let lastViseme: Viseme | null = null;

  for (let i = 0; i < characters.length; i += 1) {
    const raw = (characters[i] ?? '').toLowerCase();
    const start = starts[i] ?? 0;

    if (!/[a-zà-ÿ]/.test(raw)) {
      // Punctuation and spaces close the mouth, but only once per gap.
      if (lastViseme !== 'viseme_sil') {
        frames.push({ t: +start.toFixed(4), v: 'viseme_sil', w: 0 });
        lastViseme = 'viseme_sil';
      }
      previous = '';
      continue;
    }

    const pair = digraph(previous, raw);
    const viseme = pair ?? LETTER_VISEME[raw] ?? 'viseme_nn';

    if (pair && frames.length > 0) frames.pop(); // Replace the first half of the digraph.

    const weight = VOWELS.has(viseme) ? 0.85 : 0.55;
    if (viseme !== lastViseme || VOWELS.has(viseme)) {
      frames.push({ t: +start.toFixed(4), v: viseme, w: weight });
      lastViseme = viseme;
    }
    previous = raw;
  }

  const end = ends[ends.length - 1] ?? 0;
  frames.push({ t: +end.toFixed(4), v: 'viseme_sil', w: 0 });
  return frames;
}

/**
 * Fallback when no alignment exists — used only by the browser-speech path,
 * which has no timing data of its own. Speaking rate is a stated assumption,
 * not a measurement, so this track is always labelled `estimated`.
 */
export function estimateVisemes(text: string, wordsPerMinute = 165): VisemeFrame[] {
  const words = text.split(/\s+/).filter(Boolean);
  const perWord = 60 / wordsPerMinute;
  const frames: VisemeFrame[] = [];
  let t = 0;

  for (const word of words) {
    const letters = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!letters) continue;
    const step = perWord / Math.max(letters.length, 1);
    let previous = '';
    for (const letter of letters) {
      const viseme = digraph(previous, letter) ?? LETTER_VISEME[letter] ?? 'viseme_nn';
      frames.push({ t: +t.toFixed(4), v: viseme, w: VOWELS.has(viseme) ? 0.8 : 0.5 });
      previous = letter;
      t += step;
    }
    frames.push({ t: +t.toFixed(4), v: 'viseme_sil', w: 0 });
    t += perWord * 0.12;
  }

  return frames;
}

/** The frame in effect at time `t`, and the next one, for interpolation. */
export function frameAt(frames: VisemeFrame[], t: number): { current: VisemeFrame; next: VisemeFrame | null } {
  let low = 0;
  let high = frames.length - 1;
  let index = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (frames[mid].t <= t) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { current: frames[index] ?? { t: 0, v: 'viseme_sil', w: 0 }, next: frames[index + 1] ?? null };
}
