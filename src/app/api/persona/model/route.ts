import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { creators } from '@/db/schema';
import { looksLikeGlb } from '@/persona/model-url';

export const dynamic = 'force-dynamic';

/**
 * Set the persona model directly. The renderer only needs a GLB carrying viseme
 * blendshapes, so a creator is never blocked by a vendor disappearing.
 */
const ModelSchema = z.object({
  creatorSlug: z.string().min(1),
  modelUrl: z.string().min(8).max(2048),
  consent: z.literal(true),
});

export async function POST(request: Request) {
  const parsed = ModelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', detail: 'A model URL and an explicit consent flag are both required.' },
      { status: 400 },
    );
  }
  if (!looksLikeGlb(parsed.data.modelUrl)) {
    return NextResponse.json(
      { error: 'not_a_model', detail: 'Expected an https URL ending in .glb or .gltf.' },
      { status: 400 },
    );
  }

  const [creator] = await db
    .select()
    .from(creators)
    .where(eq(creators.slug, parsed.data.creatorSlug))
    .limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  await db.update(creators).set({ personaUrl: parsed.data.modelUrl }).where(eq(creators.id, creator.id));
  return NextResponse.json({ ok: true, personaUrl: parsed.data.modelUrl });
}
