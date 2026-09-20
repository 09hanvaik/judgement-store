import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { answers } from '@/db/schema';
import { createShare, logEvent, touchVisitor } from '@/lib/store';

export const dynamic = 'force-dynamic';

const ShareSchema = z.object({
  answerId: z.string().min(1),
  visitorId: z.string().min(1),
  parentShareId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = ShareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [answer] = await db.select().from(answers).where(eq(answers.id, parsed.data.answerId)).limit(1);
  if (!answer) return NextResponse.json({ error: 'unknown_answer' }, { status: 404 });

  await touchVisitor(parsed.data.visitorId);
  const share = await createShare({
    answerId: parsed.data.answerId,
    sharerVisitorId: parsed.data.visitorId,
    parentShareId: parsed.data.parentShareId ?? null,
  });

  await logEvent({
    type: 'share',
    visitorId: parsed.data.visitorId,
    creatorId: answer.creatorId,
    answerId: parsed.data.answerId,
    payload: { share_id: share.id, parent_share_id: share.parentShareId },
  });

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    shareId: share.id,
    url: `${origin}/a/${answer.id}?src=share&share=${share.id}`,
  });
}
