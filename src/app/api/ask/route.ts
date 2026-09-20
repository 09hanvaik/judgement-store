import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadSnapshot } from '@/lib/snapshot';
import { route as runRouter } from '@/engine/router';
import { logEvent, persistAnswer, touchVisitor } from '@/lib/store';
import { MODES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ConstraintsSchema = z
  .object({
    budget_gbp: z.number().optional(),
    time_minutes: z.number().optional(),
    skin_type: z.string().optional(),
    concern: z.array(z.string()).optional(),
    owned_item_ids: z.array(z.string()).optional(),
    occasion: z.string().optional(),
    size: z.string().optional(),
    region: z.string().optional(),
    tags: z.array(z.string()).optional(),
    wants_one: z.boolean().optional(),
  })
  .strict();

const AskSchema = z.object({
  creatorSlug: z.string().min(1),
  text: z.string().max(2000).optional(),
  chips: z.array(z.string()).optional(),
  mode: z.enum(MODES).nullable().optional(),
  visitorId: z.string().min(1),
  chipConstraints: ConstraintsSchema.optional(),
  src: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = AskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const snapshot = await loadSnapshot(input.creatorSlug);
  if (!snapshot) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  await touchVisitor(input.visitorId, { last_creator: input.creatorSlug });

  // The answer path is deterministic and offline: no LLM, no network.
  const result = runRouter(snapshot, {
    text: input.text,
    chips: input.chips,
    mode: input.mode ?? null,
    chipConstraints: input.chipConstraints,
  });

  const creator = {
    slug: snapshot.creator.slug,
    name: snapshot.creator.name,
    accent: snapshot.creator.accent,
    disclosureText: snapshot.creator.disclosureText,
    niche: snapshot.creator.niche,
  };

  if (result.kind === 'answer') {
    const audioUrl = `/audio/${result.answer.audioKey}-${result.answer.id}.mp3`;
    await persistAnswer(result.answer, audioUrl);
    await logEvent({
      type: 'answer_viewed',
      visitorId: input.visitorId,
      creatorId: snapshot.creator.id,
      answerId: result.answer.id,
      payload: {
        mode: result.mode,
        rule_ids: result.answer.ruleIds,
        template_id: result.answer.templateId,
        confidence: result.confidence,
      },
      src: input.src ?? null,
    });
    return NextResponse.json({
      kind: 'answer',
      creator,
      mode: result.mode,
      confidence: result.confidence,
      matchedPatterns: result.matchedPatterns,
      constraints: result.constraints,
      answer: { ...result.answer, audioUrl },
    });
  }

  if (result.kind === 'signal') {
    await logEvent({
      type: result.signal.type,
      visitorId: input.visitorId,
      creatorId: snapshot.creator.id,
      payload: { raw_text: input.text ?? '', offer_save: result.signal.offerSave },
      src: input.src ?? null,
    });
    return NextResponse.json({ kind: 'signal', creator, mode: 'none', signal: result.signal });
  }

  if (result.kind === 'ask_back') {
    return NextResponse.json({
      kind: 'ask_back',
      creator,
      mode: result.mode,
      constraints: result.constraints,
      askBack: result.askBack,
    });
  }

  await logEvent({
    type: 'no_match',
    visitorId: input.visitorId,
    creatorId: snapshot.creator.id,
    payload: { raw_text: input.text ?? '', mode: result.mode },
    src: input.src ?? null,
  });
  return NextResponse.json({ kind: 'no_match', creator, mode: result.mode, noMatch: result.noMatch });
}
