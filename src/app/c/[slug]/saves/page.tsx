import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SavesList } from '@/components/SavesList';
import { creatorBySlug } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function SavesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-20 pt-10"
      style={{ ['--accent' as string]: creator.accent }}
    >
      <header className="mb-6">
        <h1 className="text-xl font-semibold">My picks</h1>
        <p className="mt-1 text-sm text-muted">
          Saved on this device only. No account, no email, nothing sent to {creator.name.split(' ')[0]}.
        </p>
      </header>

      <SavesList
        creator={{
          slug: creator.slug,
          name: creator.name,
          accent: creator.accent,
          disclosureText: creator.disclosureText,
          niche: creator.niche,
        }}
      />

      <p className="mt-8 text-sm">
        <Link className="underline underline-offset-2" href={`/c/${creator.slug}`}>
          Back to {creator.name.split(' ')[0]}
        </Link>
      </p>
    </main>
  );
}
