'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnswerCard } from './AnswerCard';
import { logEvent, markVisit } from '@/lib/visitor';
import type { CardAnswer } from '@/lib/card';

/**
 * Wraps the shared card so arriving via a forward is recorded with its source
 * and its place in the share chain.
 */
export function ShareView({ answer }: { answer: CardAnswer }) {
  const params = useSearchParams();
  const src = params.get('src') ?? 'direct';
  const shareId = params.get('share');

  useEffect(() => {
    void logEvent({
      type: 'share_view',
      answerId: answer.id,
      creatorSlug: answer.creator.slug,
      src,
      payload: { share_id: shareId },
    });
    const visit = markVisit(`a.${answer.id}`);
    if (visit.isReturn) {
      void logEvent({
        type: 'return_visit',
        answerId: answer.id,
        creatorSlug: answer.creator.slug,
        src,
        payload: { days_since_first_seen: visit.daysSince, surface: 'share_page' },
      });
    }
  }, [answer.id, answer.creator.slug, shareId, src]);

  return <AnswerCard answer={answer} src={src} />;
}
