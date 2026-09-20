import 'server-only';
import { alignmentToVisemes, type Alignment, type VisemeFrame } from './visemes';

export { looksLikeGlb } from './model-url';

/**
 * Every external call for the persona pipeline lives here, server-side only.
 *
 * Routing: if DAYTONA_API_URL is set, requests go to the Daytona sandbox, which
 * holds the provider credentials — nothing but the Daytona key exists in this
 * process, and nothing at all exists in the browser. Without Daytona, the same
 * calls are made directly from the Next server, which is fine for local work.
 *
 * NONE of this is on the answer path. The router never imports this module.
 */

export interface TtsResult {
  audioBase64: string;
  frames: VisemeFrame[];
  durationSec: number;
  source: 'elevenlabs';
}

/* -------------------------------------------------------------------------- */
/* Speech                                                                     */
/* -------------------------------------------------------------------------- */

async function viaDaytona<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.DAYTONA_API_URL!.replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.DAYTONA_API_KEY?.trim() ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`daytona ${path} ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** Last character end time is the clip length; no need to decode the mp3. */
function durationFrom(alignment: Alignment): number {
  const ends = alignment.character_end_times_seconds ?? [];
  return ends.length ? Number(ends[ends.length - 1].toFixed(3)) : 0;
}

/**
 * Speech plus the timings that drive the mouth, in one call. Returning both
 * together is what removes the need for a separate forced aligner.
 */
export async function synthesise(text: string, voiceId: string): Promise<TtsResult> {
  if (process.env.DAYTONA_API_URL?.trim()) {
    const result = await viaDaytona<{ audio_base64: string; alignment: Alignment }>('/tts', {
      text,
      voice_id: voiceId,
    });
    return {
      audioBase64: result.audio_base64,
      frames: alignmentToVisemes(result.alignment),
      durationSec: durationFrom(result.alignment),
      source: 'elevenlabs',
    };
  }

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('no_tts_provider');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15 },
      }),
    },
  );
  if (!response.ok) throw new Error(`elevenlabs ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { audio_base64: string; alignment: Alignment };
  return {
    audioBase64: data.audio_base64,
    frames: alignmentToVisemes(data.alignment),
    durationSec: durationFrom(data.alignment),
    source: 'elevenlabs',
  };
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Avatar generation is deliberately pluggable. Ready Player Me shutting down
 * mid-build is the argument: the renderer only needs a GLB URL whose mesh
 * carries ARKit/Oculus viseme blendshapes, so the vendor behind that URL is a
 * configuration detail, not an architectural one.
 *
 * Set AVATAR_PROVIDER to pick one. `manual` needs no vendor at all — paste a
 * GLB URL in the onboarding screen and the whole pipeline runs.
 */
export type AvatarProviderName = 'avaturn' | 'didimo' | 'manual';

export interface AvatarResult {
  modelUrl: string;
  provider: AvatarProviderName;
}

export function avatarProviderName(): AvatarProviderName {
  const configured = process.env.AVATAR_PROVIDER?.trim().toLowerCase();
  if (configured === 'avaturn' || configured === 'didimo' || configured === 'manual') return configured;
  if (process.env.AVATURN_API_KEY?.trim()) return 'avaturn';
  if (process.env.DIDIMO_API_KEY?.trim()) return 'didimo';
  return 'manual';
}

export interface PersonaConfig {
  daytonaUrl: string | null;
  hasElevenLabs: boolean;
  avatarProvider: AvatarProviderName;
  /** True when a photo can actually be turned into a model without a human. */
  canGenerateFromPhoto: boolean;
  voiceId: string | null;
}

export function personaConfig(voiceId?: string | null): PersonaConfig {
  const daytonaUrl = process.env.DAYTONA_API_URL?.trim() || null;
  const provider = avatarProviderName();
  const hasVendorKey =
    (provider === 'avaturn' && Boolean(process.env.AVATURN_API_KEY?.trim())) ||
    (provider === 'didimo' && Boolean(process.env.DIDIMO_API_KEY?.trim()));
  return {
    daytonaUrl,
    hasElevenLabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    avatarProvider: provider,
    canGenerateFromPhoto: Boolean(daytonaUrl) || hasVendorKey,
    voiceId: voiceId ?? null,
  };
}

async function avaturn(imageBase64: string): Promise<string> {
  const key = process.env.AVATURN_API_KEY!.trim();
  const response = await fetch('https://api.avaturn.me/v1/avatars/from-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ image: imageBase64, export: { format: 'glb', morph_targets: 'ARKit' } }),
  });
  if (!response.ok) throw new Error(`avaturn ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { url?: string; glb_url?: string; data?: { url?: string } };
  const url = data.url ?? data.glb_url ?? data.data?.url;
  if (!url) throw new Error('avaturn returned no model url');
  return url;
}

async function didimo(imageBase64: string): Promise<string> {
  const key = process.env.DIDIMO_API_KEY!.trim();
  const response = await fetch('https://api.didimo.co/v3/didimos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'DIDIMO-API-KEY': key },
    body: JSON.stringify({
      input_type: 'photo',
      photo: imageBase64,
      transfer_formats: ['glb'],
      avatar_structure: 'full-body',
      features: ['arkit', 'oculus_lipsync'],
    }),
  });
  if (!response.ok) throw new Error(`didimo ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { key?: string; url?: string };
  const url = data.url ?? (data.key ? `https://api.didimo.co/v3/didimos/${data.key}/glb` : null);
  if (!url) throw new Error('didimo returned no model url');
  return url;
}

/**
 * One photo in, a rigged GLB out. No modelling, no bone rigging, no blendshape
 * sculpting: the provider ships ARKit shapes and the renderer drives them.
 */
export async function avatarFromPhoto(imageBase64: string): Promise<AvatarResult> {
  if (process.env.DAYTONA_API_URL?.trim()) {
    const result = await viaDaytona<{ model_url: string; provider?: AvatarProviderName }>('/avatar', {
      image_base64: imageBase64,
    });
    return { modelUrl: result.model_url, provider: result.provider ?? avatarProviderName() };
  }

  const provider = avatarProviderName();
  if (provider === 'avaturn' && process.env.AVATURN_API_KEY?.trim()) {
    return { modelUrl: await avaturn(imageBase64), provider };
  }
  if (provider === 'didimo' && process.env.DIDIMO_API_KEY?.trim()) {
    return { modelUrl: await didimo(imageBase64), provider };
  }
  throw new Error('no_avatar_provider');
}
