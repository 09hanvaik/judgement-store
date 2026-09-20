import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadSnapshot } from '@/lib/snapshot';
import { normalise } from '@/engine/normalise';
import { classify, PATTERNS } from '@/engine/classify';
import { extractConstraints } from '@/engine/constraints';
import { route as runRouter } from '@/engine/router';
import { MODES } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint for the demo screen. It runs the real pipeline twice and
 * reports what each stage produced, so the determinism claim can be watched
 * rather than taken on trust. Nothing here is used by the answer path.
 */

const TraceSchema = z.object({
  creatorSlug: z.string().min(1),
  text: z.string().max(2000).default(''),
  mode: z.enum(MODES).nullable().optional(),
});

const hrtimeMs = () => Number(process.hrtime.bigint() / 1000n) / 1000;

export async function POST(request: Request) {
  const parsed = TraceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const snapshot = await loadSnapshot(parsed.data.creatorSlug);
  if (!snapshot) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  const { text, mode } = parsed.data;

  // Stages 1-3 are pure, so they can be replayed here exactly as the router runs them.
  const t0 = hrtimeMs();
  const normalised = normalise(text);
  const t1 = hrtimeMs();
  const classification = classify(normalised, mode ?? null);
  const t2 = hrtimeMs();
  const constraints = extractConstraints({
    normalised,
    items: snapshot.items.map((i) => ({ id: i.id, name: i.name })),
  });
  const t3 = hrtimeMs();

  // The authoritative result, from the same function the API uses.
  const first = runRouter(snapshot, { text, mode: mode ?? null });
  const t4 = hrtimeMs();
  const second = runRouter(snapshot, { text, mode: mode ?? null });
  const t5 = hrtimeMs();

  const matchedPatterns = PATTERNS.filter((p) => classification.matched_patterns.includes(p.id)).map(
    (p) => ({ id: p.id, mode: p.mode, weight: p.weight }),
  );

  const approvedUnits = snapshot.units.filter((u) => u.status === 'approved').length;
  const candidateUnits = snapshot.units.length - approvedUnits;

  const answer = first.kind === 'answer' ? first.answer : null;
  const secondId = second.kind === 'answer' ? second.answer.id : null;

  return NextResponse.json({
    creator: { slug: snapshot.creator.slug, name: snapshot.creator.name, accent: snapshot.creator.accent },
    input: { text, mode: mode ?? null },
    kind: first.kind,
    deterministic: {
      firstId: answer?.id ?? null,
      secondId,
      identical: answer !== null && answer.id === secondId,
      firstText: answer?.renderedText ?? null,
      textIdentical:
        answer !== null && second.kind === 'answer' && answer.renderedText === second.answer.renderedText,
    },
    timings: {
      normalise: +(t1 - t0).toFixed(3),
      classify: +(t2 - t1).toFixed(3),
      constraints: +(t3 - t2).toFixed(3),
      fullRoute: +(t4 - t3).toFixed(3),
      replay: +(t5 - t4).toFixed(3),
      externalCalls: 0,
    },
    stages: [
      {
        n: 1,
        name: 'normalise',
        summary: normalised.tokens.length ? normalised.text : '(nothing typed)',
        detail: {
          tokens: normalised.tokens.length,
          money: normalised.money,
          minutes: normalised.minutes,
          counts: normalised.counts,
        },
      },
      {
        n: 2,
        name: 'classify',
        summary: `${classification.mode} · confidence ${classification.confidence}`,
        detail: {
          layer: mode ? 'A — chip set the mode' : classification.fellBack ? 'C — fell back' : 'B — phrase patterns',
          matched: matchedPatterns,
        },
      },
      {
        n: 3,
        name: 'extract constraints',
        summary:
          Object.keys(constraints).filter((k) => k !== 'keyword_hits').length === 0
            ? 'none found'
            : Object.entries(constraints)
                .filter(([k]) => k !== 'keyword_hits')
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : String(v)}`)
                .join(' · '),
        detail: { constraints: { ...constraints, keyword_hits: undefined } },
      },
      {
        n: 4,
        name: 'filter judgement units',
        summary: `${approvedUnits} approved in play · ${candidateUnits} candidates held back`,
        detail: { approvedUnits, candidateUnits, totalItems: snapshot.items.length },
      },
      {
        n: 5,
        name: 'apply rules',
        summary: answer
          ? `${answer.ruleIds.length} fired: ${answer.ruleIds.join(', ')}`
          : first.kind === 'ask_back'
            ? `ask_back from ${first.askBack.ruleId ?? 'a required constraint'}`
            : first.kind,
        detail: { fired: answer?.firedRules ?? [], totalRules: snapshot.rules.length },
      },
      {
        n: 6,
        name: 'rank',
        summary: answer
          ? answer.picks
              .map((p) => `${p.itemName ?? 'unnamed'}${p.score !== null ? ` (${p.score})` : ''}`)
              .join(' · ') || 'no picks'
          : 'not reached',
        detail: { picks: answer?.picks ?? [] },
      },
      {
        n: 7,
        name: 'skip notes',
        summary: answer
          ? answer.skipNotes.length
            ? `${answer.skipNotes.length} named`
            : 'nothing to skip'
          : 'not reached',
        detail: { skipNotes: answer?.skipNotes ?? [] },
      },
      {
        n: 8,
        name: 'ask back',
        summary:
          first.kind === 'ask_back'
            ? `"${first.askBack.question}"`
            : 'not needed — every required fact was present',
        detail: first.kind === 'ask_back' ? first.askBack : {},
      },
      {
        n: 9,
        name: 'render',
        summary: answer ? `${answer.templateId} → ${answer.renderedText.length} chars` : 'not reached',
        detail: {
          templateId: answer?.templateId ?? null,
          audioKey: answer?.audioKey ?? null,
          text: answer?.renderedText ?? null,
        },
      },
    ],
    result: first,
  });
}
