import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AskPanel } from '@/components/AskPanel';
import { creatorBySlug } from '@/lib/store';
import { readCaseFile } from '@/lib/casefile';

export const dynamic = 'force-dynamic';

export default async function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();

  const caseFile = readCaseFile(slug);
  const suggestions = (caseFile?.archetypes ?? []).slice(0, 3).map((a) => a.demo_text);

  const view = {
    slug: creator.slug,
    name: creator.name,
    accent: creator.accent,
    disclosureText: creator.disclosureText,
    niche: creator.niche,
  };

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-24 pt-8"
      style={{ ['--accent' as string]: creator.accent }}
    >
      <header className="mb-8 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-lg font-semibold"
            style={{ borderColor: creator.accent, color: creator.accent }}
            aria-hidden
          >
            {creator.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{creator.name}</h1>
            <p className="text-sm text-muted">
              {creator.niche} · {creator.handleSummary}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-white px-4 py-3">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ background: creator.accent }}
          >
            AI
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted">{creator.disclosureText}</p>
        </div>

        <p className="text-sm text-muted">
          Every answer shows her rule, her score and what she would skip. Nothing here is generated at
          the moment you ask — it is her judgement, looked up.
        </p>
      </header>

      <AskPanel creator={view} suggestions={suggestions} demo={caseFile?.demo ?? null} />

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href={`/c/${creator.slug}/saves`}>
          My picks
        </Link>
        <Link className="underline underline-offset-2" href={`/creator/${creator.slug}`}>
          Creator panel
        </Link>
        <Link className="underline underline-offset-2" href={`/creator/${creator.slug}/review`}>
          Review queue
        </Link>
      </nav>
    </main>
  );
}
