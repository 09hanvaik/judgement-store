import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { candidates, creators, judgementUnits } from '@/db/schema';
import { parseProposedUnit } from '@/db/json';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const status = new URL(request.url).searchParams.get('status') ?? 'pending';

  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  const rows = await db
    .select()
    .from(candidates)
    .where(
      status === 'all'
        ? eq(candidates.creatorId, creator.id)
        : and(eq(candidates.creatorId, creator.id), eq(candidates.status, status)),
    )
    .orderBy(desc(candidates.createdAt));

  // Candidate judgement units seeded from her notes live in the same queue.
  const candidateUnits = await db
    .select()
    .from(judgementUnits)
    .where(and(eq(judgementUnits.creatorId, creator.id), eq(judgementUnits.status, 'candidate')));

  return NextResponse.json({
    candidates: rows.map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      rawText: row.rawText,
      status: row.status,
      createdAt: row.createdAt,
      proposedUnit: parseProposedUnit(row.proposedUnit),
    })),
    candidateUnits: candidateUnits.map((unit) => ({
      id: unit.id,
      mode: unit.mode,
      itemId: unit.itemId,
      verdict: unit.verdict,
      ruleText: unit.ruleText,
      caveat: unit.caveat,
      note: unit.note,
      sourceRef: unit.sourceRef,
    })),
  });
}
