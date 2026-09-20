import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { creators } from '@/db/schema';
import { avatarFromPhoto, personaConfig } from '@/persona/providers';

export const dynamic = 'force-dynamic';

/**
 * Single-step photo onboarding. One front-facing portrait in, a rigged GLB out,
 * stored against the creator. No modelling, no bone rigging, no blendshape
 * sculpting — the provider ships ARKit shapes and the renderer drives them.
 *
 * Creator-side and one-off. Nothing here runs when a visitor asks a question.
 */

const AvatarSchema = z.object({
  creatorSlug: z.string().min(1),
  // A data URL from the webcam capture or a file picker.
  image: z.string().min(64).max(12_000_000),
  consent: z.literal(true),
});

export async function POST(request: Request) {
  const parsed = AvatarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', detail: 'A portrait and an explicit consent flag are both required.' },
      { status: 400 },
    );
  }

  const [creator] = await db
    .select()
    .from(creators)
    .where(eq(creators.slug, parsed.data.creatorSlug))
    .limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  const config = personaConfig(creator.voiceId);
  if (!config.canGenerateFromPhoto) {
    return NextResponse.json(
      {
        error: 'no_avatar_provider',
        detail:
          'Set DAYTONA_API_URL, or AVATURN_API_KEY / DIDIMO_API_KEY, to generate from a photo. You can also set a model URL directly at /api/persona/model.',
      },
      { status: 422 },
    );
  }

  const base64 = parsed.data.image.replace(/^data:image\/[a-z+]+;base64,/, '');

  try {
    const result = await avatarFromPhoto(base64);
    await db.update(creators).set({ personaUrl: result.modelUrl }).where(eq(creators.id, creator.id));
    return NextResponse.json({
      ok: true,
      personaUrl: result.modelUrl,
      provider: result.provider,
      via: config.daytonaUrl ? 'daytona' : 'direct',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'avatar_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 502 },
    );
  }
}

/** Removing a persona is the creator's call and takes effect everywhere at once. */
export async function DELETE(request: Request) {
  const slug = new URL(request.url).searchParams.get('creatorSlug') ?? '';
  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });
  await db.update(creators).set({ personaUrl: null }).where(eq(creators.id, creator.id));
  return NextResponse.json({ ok: true });
}
