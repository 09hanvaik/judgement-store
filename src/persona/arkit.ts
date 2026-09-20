import type { Viseme } from './visemes';

/**
 * Most rigged heads ship ARKit's 52 blendshapes but not Oculus visemes, so the
 * renderer drives whichever set a model actually has. This module is the bridge.
 *
 * A viseme becomes a small combination of ARKit shapes — "oo" is a pucker plus
 * a funnel plus a little jaw, not one magic slider. Weights are deliberately
 * conservative: an under-driven mouth reads as calm, an over-driven one reads
 * as a puppet.
 */

export type ArkitMix = Partial<Record<string, number>>;

export const VISEME_TO_ARKIT: Record<Viseme, ArkitMix> = {
  viseme_sil: {},
  // p, b, m — lips together, slight press.
  viseme_PP: { mouthClose: 0.85, mouthPressLeft: 0.35, mouthPressRight: 0.35 },
  // f, v — lower lip to upper teeth.
  viseme_FF: { mouthShrugUpper: 0.3, mouthLowerDownLeft: 0.35, mouthLowerDownRight: 0.35, jawOpen: 0.1 },
  viseme_TH: { tongueOut: 0.35, jawOpen: 0.18 },
  // t, d — quick tap, barely open.
  viseme_DD: { jawOpen: 0.22, mouthClose: 0.15 },
  viseme_kk: { jawOpen: 0.28 },
  // ch, sh, j — rounded and forward.
  viseme_CH: { mouthFunnel: 0.45, mouthPucker: 0.3, jawOpen: 0.15 },
  // s, z — wide and nearly closed.
  viseme_SS: { mouthStretchLeft: 0.35, mouthStretchRight: 0.35, jawOpen: 0.08 },
  viseme_nn: { jawOpen: 0.16, mouthClose: 0.25 },
  viseme_RR: { mouthPucker: 0.4, jawOpen: 0.22 },
  viseme_aa: { jawOpen: 0.7 },
  viseme_E: { jawOpen: 0.34, mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
  viseme_I: { jawOpen: 0.2, mouthStretchLeft: 0.45, mouthStretchRight: 0.45 },
  viseme_O: { jawOpen: 0.45, mouthFunnel: 0.5, mouthPucker: 0.28 },
  viseme_U: { jawOpen: 0.18, mouthPucker: 0.68, mouthFunnel: 0.4 },
};

export const BLINK_SHAPES = ['eyeBlinkLeft', 'eyeBlinkRight'];

/**
 * Rigs disagree about naming: `eyeBlink_L`, `eyeBlinkLeft`, `eyeBlinkL`,
 * `browDown_R`. Reduce them all to one spelling so a mapping written once keeps
 * working across models.
 */
export function canonicalShapeName(raw: string): string {
  if (raw.startsWith('viseme_')) return raw;
  let name = raw.trim();
  name = name.replace(/_([LR])$/i, (_m, side: string) => (side.toUpperCase() === 'L' ? 'Left' : 'Right'));
  name = name.replace(/([a-z])([LR])$/, (_m, head: string, side: string) =>
    `${head}${side === 'L' ? 'Left' : 'Right'}`,
  );
  name = name.replace(/_(left|right)$/i, (_m, side: string) =>
    side.toLowerCase() === 'left' ? 'Left' : 'Right',
  );
  name = name.replace(/_([a-z])/g, (_m, ch: string) => ch.toUpperCase());
  return name.charAt(0).toLowerCase() + name.slice(1);
}
