import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReviewQueue } from '@/components/ReviewQueue';
import { creatorBySlug } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();
  const first = creator.name.split(' ')[0];

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-24 pt-10"
      style={{ ['--accent' as string]: creator.accent }}
    >
      <header className="mb-8">
        <p className="label">Review queue</p>
        <h1 className="text-2xl font-semibold">{creator.name}</h1>
        <p className="mt-2 text-sm text-muted">
          Nothing here is live until {first} approves it. Paste a voice note and the extractor proposes
          judgement units from her own sentences — her wording is kept exactly, only the rule around it
          is structured.
        </p>
      </header>

      <ReviewQueue slug={creator.slug} creatorName={creator.name} />

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href={`/creator/${creator.slug}`}>
          Creator panel
        </Link>
        <Link className="underline underline-offset-2" href={`/c/${creator.slug}`}>
          Audience view
        </Link>
      </nav>
    </main>
  );
}
