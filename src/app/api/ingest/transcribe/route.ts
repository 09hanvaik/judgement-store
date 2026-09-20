import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Transcription is an ingestion step, never part of answering. With no
 * OPENAI_API_KEY the endpoint accepts a pasted transcript instead, which is
 * also the path the review UI uses by default.
 *
 * Accepts multipart/form-data with `audio`, or JSON {transcript}.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { transcript?: string } | null;
    const transcript = body?.transcript?.trim();
    if (!transcript) return NextResponse.json({ error: 'transcript_required' }, { status: 400 });
    return NextResponse.json({ transcript, source: 'pasted' });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'audio_or_transcript_required' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'no_transcription_key',
        detail:
          'No OPENAI_API_KEY is set. Paste the transcript text instead — POST {"transcript": "..."} as JSON.',
      },
      { status: 422 },
    );
  }

  const upstream = new FormData();
  upstream.set('file', audio, audio.name || 'voice-note.m4a');
  upstream.set('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: upstream,
  });
  if (!response.ok) {
    return NextResponse.json({ error: 'transcription_failed', detail: await response.text() }, { status: 502 });
  }

  const data = (await response.json()) as { text?: string };
  return NextResponse.json({ transcript: data.text ?? '', source: 'whisper' });
}
