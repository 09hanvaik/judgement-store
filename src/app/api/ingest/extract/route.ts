import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { candidates, creators, items } from '@/db/schema';
import { toJson } from '@/db/json';
import { extract } from '@/ingest/extract';
import { randomId } from '@/lib/store';

export const dynamic = 'force-dynamic';

const ExtractSchema = z.object({
  creatorSlug: z.string().min(1),
  rawText: z.string().min(1).max(20000),
  sourceType: z.enum(['voice_note', 'notebook', 'dm', 'post', 'other']).default('voice_note'),
});

export async function POST(request: Request) {
  const parsed = ExtractSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [creator] = await db.select().from(creators).where(eq(creators.slug, parsed.data.creatorSlug)).limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  const itemRows = await db.select().from(items).where(eq(items.creatorId, creator.id));
  const result = await extract({
    rawText: parsed.data.rawText,
    itemNames: itemRows.map((i) => ({ id: i.id, name: i.name })),
  });

  const now = new Date().toISOString();
  const rows = result.units.map((unit) => ({
    id: randomId('cand'),
    creatorId: creator.id,
    sourceType: parsed.data.sourceType,
    rawText: unit.voice_sample || parsed.data.rawText,
    proposedUnit: toJson(unit),
    status: 'pending' as const,
    createdAt: now,
  }));

  if (rows.length > 0) await db.insert(candidates).values(rows);

  return NextResponse.json({
    extractor: result.extractor,
    created: rows.length,
    candidates: rows.map((row, index) => ({ id: row.id, proposedUnit: result.units[index] })),
  });
}
