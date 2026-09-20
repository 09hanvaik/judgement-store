import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareView } from '@/components/ShareView';
import { loadAnswer } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const answer = await loadAnswer(id);
  if (!answer) return { title: 'Answer not found' };
  const pick = answer.picks[0];
  return {
    title: `${answer.creator.name}: ${pick?.itemName ?? 'her call'}`,
    description: answer.renderedText.slice(0, 180),
    openGraph: {
      title: `${answer.creator.name}'s pick`,
      description: answer.renderedText.slice(0, 180),
      images: [{ url: `/api/share/${id}/card`, width: 1200, height: 630 }],
    },
  };
}

/** The Forwarder's landing page: the same card, with no app around it. */
export default async function SharedAnswerPage({ params }: Params) {
  const { id } = await params;
  const answer = await loadAnswer(id);
  if (!answer) notFound();

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-20 pt-8"
      style={{ ['--accent' as string]: answer.creator.accent }}
    >
      <header className="mb-6">
        <p className="label">Shared answer</p>
        <h1 className="text-xl font-semibold">{answer.creator.name}</h1>
        {answer.rawText ? (
          <p className="mt-1 text-sm text-muted">Asked: &ldquo;{answer.rawText}&rdquo;</p>
        ) : null}
      </header>

      <Suspense fallback={null}>
      <ShareView
        answer={{
          id: answer.id,
          creator: answer.creator,
          mode: answer.mode,
          renderedText: answer.renderedText,
          picks: answer.picks,
          firedRules: answer.firedRules,
          skipNotes: answer.skipNotes,
          audioUrl: answer.audioUrl,
        }}
      />
      </Suspense>

      <p className="mt-8 text-sm text-muted">
        Want your own answer?{' '}
        <Link className="underline underline-offset-2" href={`/c/${answer.creator.slug}`}>
          Ask {answer.creator.name.split(' ')[0]} yourself
        </Link>
        .
      </p>
    </main>
  );
}
