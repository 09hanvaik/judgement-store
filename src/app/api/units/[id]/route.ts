import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { candidates, judgementUnits } from '@/db/schema';
import { parseProposedUnit, toJson } from '@/db/json';
import { MODES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  action: z.enum(['approve', 'edit', 'reject']),
  edits: z
    .object({
      mode: z.enum(MODES).optional(),
      verdict: z.enum(['buy', 'maybe', 'no', 'pick', 'skip']).nullable().optional(),
      score: z.number().min(0).max(10).nullable().optional(),
      ruleText: z.string().max(400).optional(),
      note: z.string().max(400).optional(),
      caveat: z.string().max(400).optional(),
      itemId: z.string().nullable().optional(),
      situation: z.record(z.unknown()).optional(),
    })
    .optional(),
});

/**
 * The approval loop. Nothing is ever auto-approved: a candidate becomes a
 * judgement unit only when a human says so here, and her raw wording is carried
 * through to voice_sample untouched.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { action, edits } = parsed.data;

  // Case 1: an existing judgement unit (including the ones seeded as candidates).
  const [unit] = await db.select().from(judgementUnits).where(eq(judgementUnits.id, id)).limit(1);
  if (unit) {
    const status = action === 'reject' ? 'rejected' : 'approved';
    await db
      .update(judgementUnits)
      .set({
        status,
        mode: edits?.mode ?? unit.mode,
        verdict: edits?.verdict !== undefined ? edits.verdict : unit.verdict,
        score: edits?.score !== undefined ? edits.score : unit.score,
        ruleText: edits?.ruleText ?? unit.ruleText,
        note: edits?.note ?? unit.note,
        caveat: edits?.caveat ?? unit.caveat,
        itemId: edits?.itemId !== undefined ? edits.itemId : unit.itemId,
        situation: edits?.situation ? toJson(edits.situation) : unit.situation,
        sourceRef: `${unit.sourceRef} · ${action}d in review`,
      })
      .where(eq(judgementUnits.id, id));
    return NextResponse.json({ ok: true, unitId: id, status });
  }

  // Case 2: a candidate extracted from a transcript.
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!candidate) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (action === 'reject') {
    await db.update(candidates).set({ status: 'rejected' }).where(eq(candidates.id, id));
    return NextResponse.json({ ok: true, candidateId: id, status: 'rejected' });
  }

  const proposed = parseProposedUnit(candidate.proposedUnit);
  const unitId = `${candidate.creatorId}-u-${candidate.id}`;

  await db.insert(judgementUnits).values({
    id: unitId,
    creatorId: candidate.creatorId,
    itemId: edits?.itemId !== undefined ? edits.itemId : proposed.item_id,
    mode: edits?.mode ?? proposed.mode,
    situation: toJson(edits?.situation ?? {}),
    verdict: edits?.verdict !== undefined ? edits.verdict : proposed.verdict,
    score: edits?.score !== undefined ? edits.score : proposed.score,
    ruleId: null,
    ruleText: edits?.ruleText ?? proposed.rule_text,
    caveat: edits?.caveat ?? proposed.caveat,
    note: edits?.note ?? proposed.note,
    // Her own words survive the edit.
    voiceSample: proposed.voice_sample || candidate.rawText,
    audioUrl: null,
    sourceRef: `${candidate.sourceType} · approved in review`,
    status: 'approved',
    priority: 0,
    createdAt: new Date().toISOString(),
  });

  await db
    .update(candidates)
    .set({ status: action === 'edit' ? 'edited' : 'approved' })
    .where(eq(candidates.id, id));

  return NextResponse.json({ ok: true, candidateId: id, unitId, status: 'approved' });
}
