import { describe, expect, it } from 'vitest';
import {
  countBanned,
  enforceSentenceLength,
  injectFillers,
  longestSentenceWords,
  stripBannedPhrases,
} from '@/engine/fillers';
import { fillTemplate } from '@/engine/render';
import { route } from '@/engine/router';
import type { StyleGuide } from '@/lib/types';
import { caseFile, snapshot, SLUGS } from './helpers';

const style: StyleGuide = {
  tone: 'test',
  dos: [],
  donts: [],
  approved_fillers: ['Right.', 'Okay.'],
  max_fillers_per_answer: 1,
  sentence_length_hint: 12,
  banned_phrases: ['great question', 'as an ai'],
  ask_back_questions: [],
};

describe('fillers', () => {
  it('never exceeds the cap, whatever the seed', () => {
    for (let i = 0; i < 200; i += 1) {
      const text = injectFillers('Cloud Cream, £38. My winter skin saviour.', style, `seed-${i}`);
      const used = style.approved_fillers.filter((f) => text.includes(f)).length;
      expect(used).toBeLessThanOrEqual(style.max_fillers_per_answer);
    }
  });

  it('only ever uses approved fillers', () => {
    for (let i = 0; i < 50; i += 1) {
      const text = injectFillers('SPF 50, £26.', style, `seed-${i}`);
      const prefix = text.replace('SPF 50, £26.', '').trim();
      if (prefix) expect(style.approved_fillers).toContain(prefix.replace(/,$/, ''));
    }
  });

  it('injects nothing when the creator has no approved fillers', () => {
    const empty = { ...style, approved_fillers: [] };
    expect(injectFillers('Black blazer, £145.', empty, 'seed')).toBe('Black blazer, £145.');
  });

  it('injects nothing when the cap is zero', () => {
    const capped = { ...style, max_fillers_per_answer: 0 };
    expect(injectFillers('Black blazer, £145.', capped, 'seed')).toBe('Black blazer, £145.');
  });

  it('is deterministic for the same seed', () => {
    expect(injectFillers('Two things.', style, 'abc')).toBe(injectFillers('Two things.', style, 'abc'));
  });

  it('does not stack a filler on top of one already there', () => {
    const text = injectFillers('Okay. SPF 50.', style, 'seed-1');
    expect(text.match(/Okay\./g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('banned phrases', () => {
  it('are stripped from rendered text', () => {
    expect(stripBannedPhrases('Great question, here is the answer.', style)).toBe(', here is the answer.');
    expect(countBanned('As an AI I cannot say', style)).toEqual(['as an ai']);
  });

  it('never appear in any answer any creator gives', async () => {
    for (const slug of SLUGS) {
      const snap = await snapshot(slug);
      const { inbox } = caseFile(slug);
      for (const example of inbox) {
        const result = route(snap, { text: example.text });
        if (result.kind !== 'answer') continue;
        expect(countBanned(result.answer.renderedText, snap.creator.styleGuide)).toEqual([]);
      }
    }
  });
});

describe('sentence length', () => {
  it('splits a sentence longer than the hint', () => {
    const long = 'This sentence is deliberately far too long for the hint, so it should be split in two.';
    expect(longestSentenceWords(enforceSentenceLength(long, 12))).toBeLessThanOrEqual(12);
  });

  it('does not cut a decimal score in half', () => {
    expect(enforceSentenceLength('Cloud Cream is 9.2 out of 10.', 18)).toBe('Cloud Cream is 9.2 out of 10.');
  });

  it('respects each creator\'s hint across her own inbox', async () => {
    for (const slug of SLUGS) {
      const snap = await snapshot(slug);
      const { inbox } = caseFile(slug);
      for (const example of inbox) {
        const result = route(snap, { text: example.text });
        if (result.kind !== 'answer') continue;
        expect(longestSentenceWords(result.answer.renderedText)).toBeLessThanOrEqual(
          snap.creator.styleGuide.sentence_length_hint,
        );
      }
    }
  });
});

describe('templates', () => {
  it('drops a sentence whose slot is missing rather than printing undefined', () => {
    const text = fillTemplate('{{pick1_name}}, {{pick1_price}}. {{pick2_name}} is the other one.', {
      pick1_name: 'Cloud Cream',
      pick1_price: '£38',
    });
    expect(text).toBe('Cloud Cream, £38.');
  });
});
