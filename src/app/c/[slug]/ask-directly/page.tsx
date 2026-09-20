import Link from 'next/link';
import { notFound } from 'next/navigation';
import { creatorBySlug } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The human escape hatch. It never pretends to be her, and it never auto-sends. */
export default async function AskDirectlyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();
  const first = creator.name.split(' ')[0];

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-20 pt-10"
      style={{ ['--accent' as string]: creator.accent }}
    >
      <h1 className="text-xl font-semibold">Ask {first} directly</h1>
      <p className="mt-3 text-muted">
        This is the way out of the AI version. Nothing on this page is sent automatically, and nothing
        you have asked so far has been forwarded to {first}.
      </p>
      <div className="card mt-6 space-y-3 px-5 py-5">
        <p className="label">Not wired up in this build</p>
        <p className="text-sm">
          The real destination is {first}&apos;s own inbox, which she has not connected here. Until she
          does, this page exists so the escape hatch is never a dead promise.
        </p>
      </div>
      <p className="mt-6 text-sm">
        <Link className="underline underline-offset-2" href={`/c/${creator.slug}`}>
          Back to {first}
        </Link>
      </p>
    </main>
  );
}
