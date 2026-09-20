import { describe, expect, it } from 'vitest';
import { normalise } from '@/engine/normalise';
import { classify } from '@/engine/classify';
import { route } from '@/engine/router';
import { caseFile, snapshot, SLUGS } from './helpers';

/**
 * Every inbox example from the three case files, asserted against the mode the
 * brief says it is. These are the messages the creators actually receive.
 */
describe('classifier — real inbox messages', () => {
  for (const slug of SLUGS) {
    const { inbox } = caseFile(slug);

    describe(slug, () => {
      for (const example of inbox) {
        it(`${example.expected_mode}: "${example.text}"`, () => {
          const result = classify(normalise(example.text));
          expect(result.mode).toBe(example.expected_mode);
        });
      }
    });
  }
});

describe('classifier — the ones that must not be answered', () => {
  it('a trust statement is a signal, not a question', async () => {
    const result = route(await snapshot('maya'), { text: 'i trust you more than Sephora tbh' });
    expect(result.kind).toBe('signal');
    if (result.kind === 'signal') expect(result.signal.type).toBe('signal_trust');
  });

  it('delayed intent is logged and offered a save', async () => {
    const result = route(await snapshot('maya'), {
      text: 'I saw the thing you recommended last week. buying it payday',
    });
    expect(result.kind).toBe('signal');
    if (result.kind === 'signal') {
      expect(result.signal.type).toBe('signal_delayed_intent');
      expect(result.signal.offerSave).toBe(true);
    }
  });

  it('"i dont even know what my skin type is" gets a question back, not a product', async () => {
    const result = route(await snapshot('maya'), { text: 'i dont even know what my skin type is lol' });
    expect(result.kind).toBe('ask_back');
    if (result.kind === 'ask_back') expect(result.askBack.question).toBe('What are you using now?');
  });
});

describe('router kinds declared in the case files', () => {
  for (const slug of SLUGS) {
    const { inbox } = caseFile(slug);
    for (const example of inbox.filter((e) => e.expect_kind)) {
      it(`${slug}: "${example.text}" is ${example.expect_kind}`, async () => {
        const result = route(await snapshot(slug), { text: example.text });
        expect(result.kind).toBe(example.expect_kind);
        if (example.expect_signal && result.kind === 'signal') {
          expect(result.signal.type).toBe(example.expect_signal);
        }
      });
    }
  }
});
