import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { answers, creators } from '@/db/schema';
import { addSave, listSaves, logEvent, removeSave, touchVisitor } from '@/lib/store';
import { parseAnswerQuery } from '@/db/json';

export const dynamic = 'force-dynamic';

const SaveSchema = z.object({
  visitorId: z.string().min(1),
  answerId: z.string().min(1),
  src: z.string().optional().nullable(),
});

async function creatorIdFor(answerId: string): Promise<string | null> {
  const [answer] = await db.select().from(answers).where(eq(answers.id, answerId)).limit(1);
  return answer?.creatorId ?? null;
}

export async function POST(request: Request) {
  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const creatorId = await creatorIdFor(parsed.data.answerId);
  if (!creatorId) return NextResponse.json({ error: 'unknown_answer' }, { status: 404 });

  await touchVisitor(parsed.data.visitorId);
  const save = await addSave(parsed.data.visitorId, parsed.data.answerId);
  await logEvent({
    type: 'save',
    visitorId: parsed.data.visitorId,
    creatorId,
    answerId: parsed.data.answerId,
    src: parsed.data.src ?? null,
  });
  return NextResponse.json({ ok: true, save });
}

export async function DELETE(request: Request) {
  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const creatorId = await creatorIdFor(parsed.data.answerId);
  if (!creatorId) return NextResponse.json({ error: 'unknown_answer' }, { status: 404 });

  await removeSave(parsed.data.visitorId, parsed.data.answerId);
  await logEvent({
    type: 'unsave',
    visitorId: parsed.data.visitorId,
    creatorId,
    answerId: parsed.data.answerId,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const visitorId = new URL(request.url).searchParams.get('visitorId');
  if (!visitorId) return NextResponse.json({ error: 'visitorId_required' }, { status: 400 });

  const rows = await listSaves(visitorId);
  if (rows.length === 0) return NextResponse.json({ saves: [] });

  const answerRows = await db
    .select()
    .from(answers)
    .where(inArray(answers.id, rows.map((r) => r.answerId)));
  const creatorRows = await db
    .select()
    .from(creators)
    .where(inArray(creators.id, [...new Set(answerRows.map((a) => a.creatorId))]));
  const creatorById = new Map(creatorRows.map((c) => [c.id, c]));

  return NextResponse.json({
    saves: rows
      .map((row) => {
        const answer = answerRows.find((a) => a.id === row.answerId);
        if (!answer) return null;
        const creator = creatorById.get(answer.creatorId);
        return {
          answerId: row.answerId,
          savedAt: row.createdAt,
          renderedText: answer.renderedText,
          mode: parseAnswerQuery(answer.query).mode,
          rawText: parseAnswerQuery(answer.query).raw_text,
          creatorSlug: creator?.slug ?? '',
          creatorName: creator?.name ?? '',
          accent: creator?.accent ?? '#12100E',
        };
      })
      .filter(Boolean),
  });
}
