import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { answers, creators } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logEvent, touchVisitor } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * One generic event endpoint. New signals need a new `type`, never a new table.
 */
const EventSchema = z.object({
  type: z.enum([
    'answer_viewed',
    'save',
    'unsave',
    'share',
    'share_view',
    'return_visit',
    'helpful',
    'not_helpful',
    'ask_directly_click',
    'no_match',
    'signal_trust',
    'signal_delayed_intent',
  ]),
  answerId: z.string().optional().nullable(),
  creatorSlug: z.string().optional(),
  visitorId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  src: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  let creatorId: string | null = null;
  if (input.answerId) {
    const [answer] = await db.select().from(answers).where(eq(answers.id, input.answerId)).limit(1);
    creatorId = answer?.creatorId ?? null;
  }
  if (!creatorId && input.creatorSlug) {
    const [creator] = await db.select().from(creators).where(eq(creators.slug, input.creatorSlug)).limit(1);
    creatorId = creator?.id ?? null;
  }
  if (!creatorId) return NextResponse.json({ error: 'unknown_creator' }, { status: 400 });

  const visitor = await touchVisitor(input.visitorId);

  const payload = { ...(input.payload ?? {}) };
  if (input.type === 'return_visit' && payload.days_since_first_seen === undefined) {
    const days = (Date.now() - new Date(visitor.firstSeen).getTime()) / 86_400_000;
    payload.days_since_first_seen = Number(days.toFixed(3));
  }

  const event = await logEvent({
    type: input.type,
    visitorId: input.visitorId,
    creatorId,
    answerId: input.answerId ?? null,
    payload,
    src: input.src ?? null,
  });

  return NextResponse.json({ ok: true, event: { id: event.id, type: event.type, ts: event.ts } });
}
