import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { creators } from '@/db/schema';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  replySecondsAvg: z.number().int().min(1).max(86400).nullable(),
});

/**
 * The only editable creator field in this build: the reply time behind the
 * time-back estimate. Sofia and Aditi have no figure in their briefs, so the
 * panel asks for it rather than showing an invented number.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  await db
    .update(creators)
    .set({ replySecondsAvg: parsed.data.replySecondsAvg })
    .where(eq(creators.id, creator.id));

  return NextResponse.json({ ok: true, replySecondsAvg: parsed.data.replySecondsAvg });
}
