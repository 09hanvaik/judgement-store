'use client';

import { logEvent } from '@/lib/visitor';
import type { CardCreator } from '@/lib/card';

/**
 * Disclosure is a feature, not small print: it ships with every answer, and it
 * always carries the way out to the real person.
 */
export function DisclosureBadge({
  creator,
  answerId = null,
  src = null,
}: {
  creator: CardCreator;
  answerId?: string | null;
  src?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-4 py-3">
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
        style={{ background: creator.accent }}
      >
        AI
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted">{creator.disclosureText}</p>
      <a
        href={`/c/${creator.slug}/ask-directly`}
        className="text-sm font-medium underline underline-offset-2"
        onClick={() =>
          void logEvent({
            type: 'ask_directly_click',
            answerId,
            creatorSlug: creator.slug,
            src,
          })
        }
      >
        Ask {creator.name.split(' ')[0]} directly
      </a>
    </div>
  );
}
