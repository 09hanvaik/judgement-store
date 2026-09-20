import { describe, expect, it } from 'vitest';
import { alignmentToVisemes, estimateVisemes, frameAt } from '@/persona/visemes';
import { looksLikeGlb } from '@/persona/model-url';
import { BLINK_SHAPES, VISEME_TO_ARKIT, canonicalShapeName } from '@/persona/arkit';

/** Alignment as ElevenLabs returns it: one entry per character. */
function alignmentFor(text: string, secondsPerChar = 0.06) {
  const characters = text.split('');
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => +(i * secondsPerChar).toFixed(4)),
    character_end_times_seconds: characters.map((_, i) => +((i + 1) * secondsPerChar).toFixed(4)),
  };
}

describe('visemes from real timings', () => {
  it('is monotonic in time', () => {
    const frames = alignmentToVisemes(alignmentFor('Cloud Cream, thirty eight pounds.'));
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i].t).toBeGreaterThanOrEqual(frames[i - 1].t);
    }
  });

  it('opens on vowels and closes on silence', () => {
    const frames = alignmentToVisemes(alignmentFor('aa'));
    expect(frames[0].v).toBe('viseme_aa');
    expect(frames[0].w).toBeGreaterThan(0.5);
    expect(frames[frames.length - 1].v).toBe('viseme_sil');
    expect(frames[frames.length - 1].w).toBe(0);
  });

  it('reads th, ch and sh as one shape, not two', () => {
    expect(alignmentToVisemes(alignmentFor('th')).some((f) => f.v === 'viseme_TH')).toBe(true);
    expect(alignmentToVisemes(alignmentFor('ch')).some((f) => f.v === 'viseme_CH')).toBe(true);
    expect(alignmentToVisemes(alignmentFor('sh')).some((f) => f.v === 'viseme_CH')).toBe(true);
  });

  it('closes the mouth once per gap, not once per space', () => {
    const frames = alignmentToVisemes(alignmentFor('a   b'));
    const silences = frames.filter((f) => f.v === 'viseme_sil');
    // One for the run of spaces, one to close the clip.
    expect(silences.length).toBe(2);
  });

  it('every weight stays inside 0..1', () => {
    for (const frame of alignmentToVisemes(alignmentFor('Nonnegotiable, and I would buy it again.'))) {
      expect(frame.w).toBeGreaterThanOrEqual(0);
      expect(frame.w).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    const a = alignmentToVisemes(alignmentFor('My winter skin saviour.'));
    const b = alignmentToVisemes(alignmentFor('My winter skin saviour.'));
    expect(a).toEqual(b);
  });
});

describe('estimated visemes', () => {
  it('produces a track without any timing data', () => {
    const frames = estimateVisemes('SPF fifty, twenty six pounds.');
    expect(frames.length).toBeGreaterThan(5);
    expect(frames[0].t).toBe(0);
  });

  it('runs longer for longer text', () => {
    const short = estimateVisemes('Buy it.');
    const long = estimateVisemes('Buy it, and then buy the other one as well, honestly.');
    expect(long[long.length - 1].t).toBeGreaterThan(short[short.length - 1].t);
  });

  it('is empty for text with no letters', () => {
    expect(estimateVisemes('... !!!')).toEqual([]);
  });
});

describe('frame lookup', () => {
  const frames = alignmentToVisemes(alignmentFor('Red Reset'));

  it('finds the frame in effect at a time', () => {
    const { current } = frameAt(frames, frames[2].t + 0.001);
    expect(current.t).toBe(frames[2].t);
  });

  it('clamps before the first frame and after the last', () => {
    expect(frameAt(frames, -5).current).toEqual(frames[0]);
    expect(frameAt(frames, 9999).next).toBeNull();
  });
});

describe('model url validation', () => {
  it('accepts an https glb', () => {
    expect(looksLikeGlb('https://example.com/a.glb')).toBe(true);
    expect(looksLikeGlb('https://example.com/a.glb?morphTargets=ARKit')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(looksLikeGlb('http://example.com/a.glb')).toBe(false);
    expect(looksLikeGlb('https://example.com/a.png')).toBe(false);
    expect(looksLikeGlb('javascript:alert(1)')).toBe(false);
    expect(looksLikeGlb('not a url')).toBe(false);
  });
});

describe('blendshape naming across rigs', () => {
  it('reduces every common spelling to one name', () => {
    for (const raw of ['eyeBlink_L', 'eyeBlinkLeft', 'eyeBlinkL', 'eye_blink_left']) {
      expect(canonicalShapeName(raw)).toBe('eyeBlinkLeft');
    }
    for (const raw of ['mouthPress_R', 'mouthPressRight', 'mouthPressR']) {
      expect(canonicalShapeName(raw)).toBe('mouthPressRight');
    }
  });

  it('leaves single-sided shapes alone', () => {
    expect(canonicalShapeName('jawOpen')).toBe('jawOpen');
    expect(canonicalShapeName('mouthFunnel')).toBe('mouthFunnel');
    expect(canonicalShapeName('tongueOut')).toBe('tongueOut');
  });

  it('never rewrites a viseme name', () => {
    expect(canonicalShapeName('viseme_PP')).toBe('viseme_PP');
    expect(canonicalShapeName('viseme_aa')).toBe('viseme_aa');
  });

  it('maps every viseme to shapes the sample rig actually has', () => {
    // The 52 ARKit names carried by three.js's facecap.glb, canonicalised.
    const rig = new Set(
      [
        'jawOpen', 'jawForward', 'jawLeft', 'jawRight', 'mouthFunnel', 'mouthPucker',
        'mouthLeft', 'mouthRight', 'mouthRollUpper', 'mouthRollLower', 'mouthShrugUpper',
        'mouthShrugLower', 'mouthClose', 'mouthSmileLeft', 'mouthSmileRight',
        'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight',
        'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
        'mouthPressLeft', 'mouthPressRight', 'mouthStretchLeft', 'mouthStretchRight',
        'tongueOut', 'eyeBlinkLeft', 'eyeBlinkRight',
      ],
    );
    for (const [viseme, mix] of Object.entries(VISEME_TO_ARKIT)) {
      for (const shape of Object.keys(mix)) {
        expect(rig.has(shape), `${viseme} -> ${shape}`).toBe(true);
      }
    }
    for (const shape of BLINK_SHAPES) expect(rig.has(shape)).toBe(true);
  });

  it('keeps every mix weight inside 0..1', () => {
    for (const mix of Object.values(VISEME_TO_ARKIT)) {
      for (const value of Object.values(mix)) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
