'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getVisitorId, logEvent, markVisit } from '@/lib/visitor';
import type { CardCreator } from '@/lib/card';

interface SaveRow {
  answerId: string;
  savedAt: string;
  renderedText: string;
  mode: string;
  rawText: string;
  creatorSlug: string;
  creatorName: string;
  accent: string;
}

/** "My picks" — the Silent Browser's surface. Loading it is itself a return signal. */
export function SavesList({ creator }: { creator: CardCreator }) {
  const [rows, setRows] = useState<SaveRow[] | null>(null);

  useEffect(() => {
    const visit = markVisit(`saves.${creator.slug}`);
    void logEvent({
      type: 'return_visit',
      creatorSlug: creator.slug,
      payload: {
        days_since_first_seen: visit.daysSince,
        surface: 'saves',
        first_time: !visit.isReturn,
      },
    });

    void (async () => {
      const response = await fetch(`/api/saves?visitorId=${encodeURIComponent(getVisitorId())}`);
      const data = (await response.json()) as { saves: SaveRow[] };
      setRows(data.saves ?? []);
    })();
  }, [creator.slug]);

  if (rows === null) return <p className="text-sm text-muted">Loading your picks…</p>;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing saved yet.{' '}
        <Link className="underline underline-offset-2" href={`/c/${creator.slug}`}>
          Ask {creator.name.split(' ')[0]} something
        </Link>{' '}
        and tap Save — it needs no message and no reply.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.answerId}>
          <Link
            href={`/a/${row.answerId}?src=saves`}
            className="card block px-5 py-4 transition-colors hover:border-ink"
            style={{ ['--accent' as string]: row.accent }}
          >
            <p className="label">
              {row.creatorName} · {row.mode}
            </p>
            {row.rawText ? (
              <p className="mt-1 text-sm text-muted">&ldquo;{row.rawText}&rdquo;</p>
            ) : null}
            <p className="mt-1">{row.renderedText}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
