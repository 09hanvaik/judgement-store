import { describe, expect, it } from 'vitest';
import { POST as ask } from '@/app/api/ask/route';
import { POST as postEvent } from '@/app/api/events/route';
import { DELETE as deleteSave, GET as getSaves, POST as postSave } from '@/app/api/saves/route';
import { POST as postShare } from '@/app/api/share/route';
import { GET as getAnswer } from '@/app/api/answers/[id]/route';
import { GET as getInsights } from '@/app/api/creators/[slug]/insights/route';
import { POST as postExtract } from '@/app/api/ingest/extract/route';
import { POST as postTranscribe } from '@/app/api/ingest/transcribe/route';
import { GET as getCandidates } from '@/app/api/creators/[slug]/candidates/route';
import { PATCH as patchUnit } from '@/app/api/units/[id]/route';

const BASE = 'http://localhost:3000';

function post(url: string, body: unknown, method = 'POST') {
  return new Request(BASE + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const visitor = (suffix: string) => `v_test_${suffix}`;

describe('POST /api/ask', () => {
  it('returns an answer with picks, rules and a disclosure', async () => {
    const response = await ask(
      post('/api/ask', { creatorSlug: 'maya', visitorId: visitor('ask1'), text: 'i have dry skin' }),
    );
    const body = await json<any>(response);
    expect(response.status).toBe(200);
    expect(body.kind).toBe('answer');
    expect(body.answer.picks.length).toBeGreaterThan(0);
    expect(body.answer.firedRules.length).toBeGreaterThan(0);
    expect(body.creator.disclosureText).toContain('AI version of Maya Rao');
    expect(body.answer.audioUrl).toMatch(/^\/audio\/.+\.mp3$/);
  });

  it('is idempotent: the same question reuses the same answer row', async () => {
    const body = { creatorSlug: 'maya', visitorId: visitor('ask2'), text: 'what would you buy' };
    const first = await json<any>(await ask(post('/api/ask', body)));
    const second = await json<any>(await ask(post('/api/ask', body)));
    expect(second.answer.id).toBe(first.answer.id);
  });

  it('rejects a malformed request', async () => {
    const response = await ask(post('/api/ask', { text: 'no creator, no visitor' }));
    expect(response.status).toBe(400);
  });

  it('404s for a creator that does not exist', async () => {
    const response = await ask(post('/api/ask', { creatorSlug: 'nobody', visitorId: visitor('x'), text: 'hi' }));
    expect(response.status).toBe(404);
  });

  it('returns a signal, not an answer, for a trust statement', async () => {
    const body = await json<any>(
      await ask(post('/api/ask', { creatorSlug: 'maya', visitorId: visitor('ask3'), text: 'i trust you more than Sephora tbh' })),
    );
    expect(body.kind).toBe('signal');
    expect(body.signal.type).toBe('signal_trust');
  });
});

describe('GET /api/answers/[id]', () => {
  it('rebuilds a stored answer with its items, units and rules', async () => {
    const asked = await json<any>(
      await ask(post('/api/ask', { creatorSlug: 'maya', visitorId: visitor('detail'), text: 'i have oily skin' })),
    );
    const response = await getAnswer(new Request(BASE), { params: Promise.resolve({ id: asked.answer.id }) });
    const body = await json<any>(response);
    expect(body.answer.picks[0].itemName).toBeTruthy();
    expect(body.answer.firedRules[0].text.length).toBeGreaterThan(10);
    expect(body.answer.creator.disclosureText).toBeTruthy();
    // The share page is a Forwarder's landing page: every rule must resolve,
    // whether it lives in the rules table or on the judgement unit.
    for (const rule of body.answer.firedRules) {
      expect(rule.text).not.toBe('Rule text unavailable.');
    }
  });

  it('404s for an unknown id', async () => {
    const response = await getAnswer(new Request(BASE), { params: Promise.resolve({ id: 'deadbeef00' }) });
    expect(response.status).toBe(404);
  });
});

describe('events, saves and shares', () => {
  it('records a save, lists it, and removes it', async () => {
    const id = visitor('saves');
    const asked = await json<any>(
      await ask(post('/api/ask', { creatorSlug: 'maya', visitorId: id, text: 'just tell me' })),
    );

    expect((await postSave(post('/api/saves', { visitorId: id, answerId: asked.answer.id }))).status).toBe(200);

    const listed = await json<any>(await getSaves(new Request(`${BASE}/api/saves?visitorId=${id}`)));
    expect(listed.saves).toHaveLength(1);
    expect(listed.saves[0].creatorSlug).toBe('maya');

    await deleteSave(post('/api/saves', { visitorId: id, answerId: asked.answer.id }, 'DELETE'));
    const after = await json<any>(await getSaves(new Request(`${BASE}/api/saves?visitorId=${id}`)));
    expect(after.saves).toHaveLength(0);
  });

  it('saving twice does not duplicate the row', async () => {
    const id = visitor('saves2');
    const asked = await json<any>(
      await ask(post('/api/ask', { creatorSlug: 'maya', visitorId: id, text: 'i have dry skin' })),
    );
    await postSave(post('/api/saves', { visitorId: id, answerId: asked.answer.id }));
    await postSave(post('/api/saves', { visitorId: id, answerId: asked.answer.id }));
    const listed = await json<any>(await getSaves(new Request(`${BASE}/api/saves?visitorId=${id}`)));
    expect(listed.saves).toHaveLength(1);
  });

  it('builds a share chain through parent_share_id', async () => {
    const sharer = visitor('share1');
    const asked = await json<any>(
      await ask(post('/api/ask', { creatorSlug: 'maya', visitorId: sharer, text: 'anything under £30' })),
    );

    const parent = await json<any>(
      await postShare(post('/api/share', { answerId: asked.answer.id, visitorId: sharer })),
    );
    expect(parent.url).toContain('src=share');

    const child = await json<any>(
      await postShare(
        post('/api/share', {
          answerId: asked.answer.id,
          visitorId: visitor('share2'),
          parentShareId: parent.shareId,
        }),
      ),
    );
    expect(child.shareId).not.toBe(parent.shareId);

    await postEvent(
      post('/api/events', {
        type: 'share_view',
        visitorId: visitor('share3'),
        answerId: asked.answer.id,
        src: 'share',
        payload: { share_id: parent.shareId },
      }),
    );

    const insights = await json<any>(
      await getInsights(new Request(BASE), { params: Promise.resolve({ slug: 'maya' }) }),
    );
    const chain = insights.live.shareChains.find((node: any) => node.id === parent.shareId);
    expect(chain).toBeTruthy();
    expect(chain.children.map((c: any) => c.id)).toContain(child.shareId);
    expect(chain.views).toBeGreaterThanOrEqual(1);
    expect(insights.live.shareViewsViaShare).toBeGreaterThanOrEqual(1);
  });

  it('rejects an unknown event type', async () => {
    const response = await postEvent(post('/api/events', { type: 'nonsense', visitorId: visitor('e') }));
    expect(response.status).toBe(400);
  });

  it('computes days since first seen on a return visit', async () => {
    const id = visitor('return');
    await ask(post('/api/ask', { creatorSlug: 'maya', visitorId: id, text: 'i have dry skin' }));
    const response = await postEvent(
      post('/api/events', { type: 'return_visit', visitorId: id, creatorSlug: 'maya' }),
    );
    expect(response.status).toBe(200);

    const insights = await json<any>(
      await getInsights(new Request(BASE), { params: Promise.resolve({ slug: 'maya' }) }),
    );
    expect(insights.live.returnLagDays.samples).toBeGreaterThan(0);
  });
});

describe('GET /api/creators/[slug]/insights', () => {
  it('separates live numbers from the labelled case-file sample', async () => {
    const body = await json<any>(
      await getInsights(new Request(BASE), { params: Promise.resolve({ slug: 'maya' }) }),
    );
    expect(body.live.funnel.map((s: any) => s.step)).toEqual([
      'Answer viewed',
      'Saved',
      'Shared',
      'Returned',
    ]);
    expect(body.live.answersServed).toBeGreaterThan(0);
    expect(body.sample.label).toBe('Sample from case file, not live');
    expect(body.sample.computed.length).toBeGreaterThan(0);
    for (const stat of body.caseStats) expect(stat.sourceRef).toContain('case file');
  });

  it('shows the time-back formula, and no number where there is no reply time', async () => {
    const maya = await json<any>(
      await getInsights(new Request(BASE), { params: Promise.resolve({ slug: 'maya' }) }),
    );
    expect(maya.live.timeBack.formula).toContain('reply_seconds_avg');
    expect(maya.live.timeBack.label).toBe('estimate');
    expect(maya.live.timeBack.hoursSaved).toBeCloseTo((maya.live.answersServed * 52) / 3600, 2);

    const sofia = await json<any>(
      await getInsights(new Request(BASE), { params: Promise.resolve({ slug: 'sofia' }) }),
    );
    expect(sofia.live.timeBack.needsReplyTime).toBe(true);
    expect(sofia.live.timeBack.hoursSaved).toBeNull();
  });
});

describe('ingestion and approval', () => {
  it('accepts a pasted transcript when no transcription key is set', async () => {
    const response = await postTranscribe(post('/api/ingest/transcribe', { transcript: 'the cloud cream is worth it' }));
    const body = await json<any>(response);
    expect(body.source).toBe('pasted');
    expect(body.transcript).toContain('cloud cream');
  });

  it('extracts candidates heuristically and never auto-approves them', async () => {
    const body = await json<any>(
      await postExtract(
        post('/api/ingest/extract', {
          creatorSlug: 'maya',
          rawText:
            'The Glass Drop is good but I would not pay £62 for it. Cloud Cream is worth it, I would buy it again.',
          sourceType: 'voice_note',
        }),
      ),
    );
    expect(body.extractor).toBe('heuristic');
    expect(body.created).toBeGreaterThanOrEqual(2);

    const queue = await json<any>(
      await getCandidates(new Request(`${BASE}/api/creators/maya/candidates`), {
        params: Promise.resolve({ slug: 'maya' }),
      }),
    );
    const pending = queue.candidates.filter((c: any) => c.status === 'pending');
    expect(pending.length).toBeGreaterThanOrEqual(2);
    // Her exact words survive extraction.
    expect(pending.some((c: any) => c.proposedUnit.voice_sample.includes('would not pay £62'))).toBe(true);
  });

  it('approving a candidate promotes it to an approved judgement unit', async () => {
    const extracted = await json<any>(
      await postExtract(
        post('/api/ingest/extract', {
          creatorSlug: 'maya',
          rawText: 'Soft Clean is best for sensitive days, I would buy it again.',
          sourceType: 'voice_note',
        }),
      ),
    );
    const candidateId = extracted.candidates[0].id;

    const approved = await json<any>(
      await patchUnit(post(`/api/units/${candidateId}`, { action: 'approve' }, 'PATCH'), {
        params: Promise.resolve({ id: candidateId }),
      }),
    );
    expect(approved.ok).toBe(true);
    expect(approved.status).toBe('approved');

    const after = await json<any>(
      await getCandidates(new Request(`${BASE}/api/creators/maya/candidates?status=all`), {
        params: Promise.resolve({ slug: 'maya' }),
      }),
    );
    expect(after.candidates.find((c: any) => c.id === candidateId).status).toBe('approved');
  });

  it('rejecting a seeded candidate unit leaves it out of answers', async () => {
    const queue = await json<any>(
      await getCandidates(new Request(`${BASE}/api/creators/sofia/candidates`), {
        params: Promise.resolve({ slug: 'sofia' }),
      }),
    );
    const unitId = queue.candidateUnits[0].id;
    const response = await patchUnit(post(`/api/units/${unitId}`, { action: 'reject' }, 'PATCH'), {
      params: Promise.resolve({ id: unitId }),
    });
    const body = await json<any>(response);
    expect(body.status).toBe('rejected');
  });
});
