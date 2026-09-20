import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { creators, personaAssets } from '@/db/schema';
import { parseStringArray } from '@/db/json';
import { sha256 } from '@/engine/hash';
import { personaConfig, synthesise } from '@/persona/providers';
import { estimateVisemes, type VisemeFrame } from '@/persona/visemes';
import { randomId } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Serves the persona's delivery of a line.
 *
 * Cache first, always. A pre-generated track (see scripts/generate-persona.mjs)
 * is returned with no external call, which is what keeps the demo path clean.
 * `live` is opt-in and exists for the spec's arbitrary-text requirement; when it
 * is off, or no provider is configured, the response says `estimated` and the
 * browser speaks the line itself with an approximate mouth.
 */

const SpeakSchema = z.object({
  creatorSlug: z.string().min(1),
  text: z.string().min(1).max(1200),
  answerId: z.string().optional().nullable(),
  live: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = SpeakSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { creatorSlug, text, answerId, live } = parsed.data;

  const [creator] = await db.select().from(creators).where(eq(creators.slug, creatorSlug)).limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });

  const textHash = sha256(`${creator.id}|${text}`).slice(0, 16);

  const [cached] = await db
    .select()
    .from(personaAssets)
    .where(and(eq(personaAssets.creatorId, creator.id), eq(personaAssets.textHash, textHash)))
    .limit(1);

  if (cached) {
    return NextResponse.json({
      track: {
        answerId: cached.answerId ?? answerId ?? null,
        audioUrl: cached.audioUrl,
        durationSec: cached.durationSec,
        frames: JSON.parse(cached.visemes) as VisemeFrame[],
        source: cached.source,
      },
      cached: true,
    });
  }

  const config = personaConfig(creator.voiceId);
  const canSynthesise = Boolean(live && creator.voiceId && (config.daytonaUrl || config.hasElevenLabs));

  if (canSynthesise) {
    try {
      const result = await synthesise(text, creator.voiceId as string);
      const audioUrl = `data:audio/mpeg;base64,${result.audioBase64}`;
      await db
        .insert(personaAssets)
        .values({
          id: randomId('pa'),
          creatorId: creator.id,
          answerId: answerId ?? null,
          textHash,
          audioUrl,
          visemes: JSON.stringify(result.frames),
          durationSec: result.durationSec,
          source: result.source,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing();

      return NextResponse.json({
        track: {
          answerId: answerId ?? null,
          audioUrl,
          durationSec: result.durationSec,
          frames: result.frames,
          source: result.source,
        },
        cached: false,
        via: config.daytonaUrl ? 'daytona' : 'direct',
      });
    } catch (error) {
      // A provider failure must never break the answer — fall through to the
      // browser's own voice rather than showing the visitor an error.
      console.warn('persona synthesis failed, falling back to browser speech:', error);
    }
  }

  const frames = estimateVisemes(text);
  return NextResponse.json({
    track: {
      answerId: answerId ?? null,
      audioUrl: null,
      durationSec: frames.length ? frames[frames.length - 1].t : 0,
      frames,
      source: 'estimated',
    },
    cached: false,
    reason: creator.voiceId
      ? live
        ? 'provider_unavailable'
        : 'live_disabled'
      : 'no_consented_voice',
  });
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('creatorSlug') ?? '';
  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });
  const config = personaConfig(creator.voiceId);
  return NextResponse.json({
    personaUrl: creator.personaUrl,
    voiceConsented: Boolean(creator.voiceId),
    daytona: Boolean(config.daytonaUrl),
    tts: config.hasElevenLabs || Boolean(config.daytonaUrl),
    avatar: config.canGenerateFromPhoto,
    avatarProvider: config.avatarProvider,
    cachedLines: parseStringArray('[]').length,
  });
}
