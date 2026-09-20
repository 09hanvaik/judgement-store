import Link from 'next/link';
import { db } from '@/db/client';
import { creators } from '@/db/schema';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const rows = await db.select().from(creators);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-20 pt-12">
      <h1 className="text-2xl font-semibold">Judgement store</h1>
      <p className="mt-3 text-muted">
        One codebase, creators seeded as data. Every answer is looked up from a creator&apos;s own
        notes and shows the rule behind it. No model runs when you ask.
      </p>

      <ul className="mt-8 space-y-3">
        {rows.map((creator) => (
          <li key={creator.id}>
            <Link
              href={`/c/${creator.slug}`}
              className="card flex items-center gap-3 px-5 py-4 transition-colors hover:border-ink"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold"
                style={{ borderColor: creator.accent, color: creator.accent }}
              >
                {creator.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{creator.name}</span>
                <span className="block text-sm text-muted">{creator.niche}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          No creators seeded yet. Run <code>npm run db:reset</code>.
        </p>
      ) : null}
    </main>
  );
}
