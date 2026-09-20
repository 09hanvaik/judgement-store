import { describe, expect, it } from 'vitest';
import { route, type RouterResult } from '@/engine/router';
import { caseFile, snapshot, SLUGS } from './helpers';

function answerOf(result: RouterResult) {
  if (result.kind !== 'answer') throw new Error(`expected an answer, got ${result.kind}`);
  return result.answer;
}

describe('purity and determinism', () => {
  it('the same question twice gives the same id, text and picks', async () => {
    const snap = await snapshot('maya');
    const input = { text: 'i have dry skin + redness and £60. tell me what to buy pls' };
    const a = answerOf(route(snap, input));
    const b = answerOf(route(snap, input));
    expect(b.id).toBe(a.id);
    expect(b.renderedText).toBe(a.renderedText);
    expect(b.unitIds).toEqual(a.unitIds);
    expect(b.ruleIds).toEqual(a.ruleIds);
  });

  it('is content-addressed: a different question gives a different id', async () => {
    const snap = await snapshot('maya');
    const a = answerOf(route(snap, { text: 'i have dry skin, what should i buy' }));
    const b = answerOf(route(snap, { text: 'i have oily skin, what should i buy' }));
    expect(a.id).not.toBe(b.id);
  });

  it('does not mutate the snapshot it was given', async () => {
    const snap = await snapshot('maya');
    const before = JSON.stringify(snap);
    route(snap, { text: 'i already have the night serum. what next?' });
    route(snap, { text: 'is the cloud cream worth £38' });
    expect(JSON.stringify(snap)).toBe(before);
  });

  it('ids are stable across separately loaded snapshots', async () => {
    const snap = await snapshot('maya');
    const fresh = await snapshot('maya');
    expect(answerOf(route(fresh, { text: 'just tell me' })).id).toBe(
      answerOf(route(snap, { text: 'just tell me' })).id,
    );
  });
});

describe('rule engine', () => {
  it('exclusions run before includes: Glass Drop never survives her value rule', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(route(snap, { text: 'anything good under £100?' }));
    expect(answer.itemIds).not.toContain('maya-i-glass-drop');
    expect(answer.skipNotes.some((note) => note.item_id === 'maya-i-glass-drop')).toBe(true);
  });

  it('budget filters by price and says what it dropped', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(route(snap, { text: 'anything like this but under £30?' }));
    for (const id of answer.itemIds) {
      const item = snap.items.find((i) => i.id === id);
      expect(item?.priceGbp ?? 0).toBeLessThanOrEqual(30);
    }
    expect(answer.skipNotes.length).toBeGreaterThan(0);
  });

  it('a price mentioned in a verdict question is not treated as a ceiling', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(route(snap, { text: 'is the cloud cream actually worth £38' }));
    expect(answer.itemIds).toEqual(['maya-i-cloud-cream']);
  });

  it('caps at one when she is asked for one', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(route(snap, { text: 'okay but if u could only keep ONE of these which one' }));
    expect(answer.picks).toHaveLength(1);
  });

  it('caps at two when she is asked for two', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(
      route(snap, { text: 'can you make me a routine but only 2 products bc i will not do 8 steps' }),
    );
    expect(answer.picks.length).toBeLessThanOrEqual(2);
  });

  it('a budget question with no budget asks for one instead of guessing', async () => {
    const result = route(await snapshot('maya'), { text: '', mode: 'budget' });
    expect(result.kind).toBe('ask_back');
    if (result.kind === 'ask_back') expect(result.askBack.question).toBe('Budget?');
  });

  it('a rule can demand a clarifying question before any pick', async () => {
    const result = route(await snapshot('maya'), { text: 'what shade are u wearing in todays video???' });
    expect(result.kind).toBe('ask_back');
    if (result.kind === 'ask_back') {
      expect(result.askBack.question).toBe('What foundation are you wearing now?');
      expect(result.askBack.ruleId).toBe('R-MAYA-SHADE-ASK');
    }
  });

  it('never recommends something the visitor already owns', async () => {
    const result = route(await snapshot('maya'), {
      text: 'i already have the night serum. do i need the barrier cream too???',
    });
    const answer = answerOf(result);
    expect(answer.itemIds).not.toContain('maya-i-night-serum');
    expect(answer.ruleIds).toContain('R-CORE-OWNED');
  });

  it('every answer carries at least one rule with plain-English text', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(route(snap, { text: 'i have dry skin' }));
    expect(answer.firedRules.length).toBeGreaterThan(0);
    for (const rule of answer.firedRules) {
      expect(rule.id).toBeTruthy();
      expect(rule.text.length).toBeGreaterThan(10);
    }
  });

  it('the rule that produced the pick leads the list, guards come last', async () => {
    const snap = await snapshot('maya');
    const answer = answerOf(route(snap, { text: 'i have dry skin' }));
    expect(answer.firedRules[0].id).toBe('R-MAYA-DRY');
    expect(answer.firedRules[answer.firedRules.length - 1].id).toContain('GUARD');
  });
});

describe('data integrity — nothing invented', () => {
  it('every item id in every answer exists in the seed data', async () => {
    for (const slug of SLUGS) {
      const snap = await snapshot(slug);
      const known = new Set(snap.items.map((i) => i.id));
      const { inbox } = caseFile(slug);
      const probes = [...inbox.map((e) => e.text), 'just tell me', 'what would you buy', 'under £60'];
      for (const text of probes) {
        const result = route(snap, { text });
        if (result.kind !== 'answer') continue;
        for (const id of result.answer.itemIds) expect(known.has(id)).toBe(true);
        for (const note of result.answer.skipNotes) {
          if (note.item_id) expect(known.has(note.item_id)).toBe(true);
        }
      }
    }
  });

  it("Maya's unnamed barrier oil is never recommended", async () => {
    const snap = await snapshot('maya');
    expect(snap.items.some((i) => /barrier/i.test(i.name))).toBe(false);

    const probes = [
      'i already have the night serum. do i need the barrier cream too???',
      'i have dry skin, what should i buy',
      'what would you buy for dry skin with your own money',
    ];
    for (const text of probes) {
      const result = route(snap, { text });
      if (result.kind !== 'answer') continue;
      for (const pick of result.answer.picks) {
        expect(pick.itemName ?? '').not.toMatch(/barrier/i);
      }
    }
  });

  it('candidate units never surface in an answer', async () => {
    for (const slug of SLUGS) {
      const snap = await snapshot(slug);
      const candidateIds = new Set(
        snap.units.filter((u) => u.status !== 'approved').map((u) => u.id),
      );
      const { inbox } = caseFile(slug);
      for (const example of inbox) {
        const result = route(snap, { text: example.text });
        if (result.kind !== 'answer') continue;
        for (const unitId of result.answer.unitIds) expect(candidateIds.has(unitId)).toBe(false);
      }
    }
  });

  it('Aditi will not answer a decision she has not made', async () => {
    const result = route(await snapshot('aditi'), {
      text: 'Ok but if you were me, would you take the seed-stage offer or stay put?',
    });
    expect(result.kind).toBe('no_match');
  });

  it('Aditi asks which room rather than inventing steps', async () => {
    const result = route(await snapshot('aditi'), {
      text: 'I took the job. What do I actually do in the first 30 days?',
    });
    expect(result.kind).toBe('ask_back');
    if (result.kind === 'ask_back') expect(result.askBack.ruleId).toBe('R-ADITI-ROUTE-ASK');
  });

  it('Sofia has no scores, so nothing prints a made-up one', async () => {
    const snap = await snapshot('sofia');
    const answer = answerOf(route(snap, { text: 'Ok but if you were me, which one would you actually buy?' }));
    for (const pick of answer.picks) expect(pick.score).toBeNull();
    expect(answer.renderedText).not.toMatch(/\/10/);
  });
});

describe('rendering degrades gracefully', () => {
  it('never prints undefined, null or an unfilled slot', async () => {
    for (const slug of SLUGS) {
      const snap = await snapshot(slug);
      const { inbox } = caseFile(slug);
      for (const example of inbox) {
        const result = route(snap, { text: example.text });
        const text =
          result.kind === 'answer'
            ? result.answer.renderedText
            : result.kind === 'ask_back'
              ? result.askBack.question
              : result.kind === 'signal'
                ? result.signal.text
                : result.noMatch.text;
        expect(text).not.toMatch(/undefined|null|\{\{/);
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
