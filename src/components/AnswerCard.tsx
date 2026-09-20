'use client';

import { useEffect, useState } from 'react';
import { VoicePlayer } from './VoicePlayer';
import { DisclosureBadge } from './DisclosureBadge';
import { getVisitorId, logEvent } from '@/lib/visitor';
import { VERDICT_LABEL, type CardAnswer } from '@/lib/card';

/**
 * The single answer card. Used on the creator page, the saves list and the
 * standalone share page, so a forwarded link shows exactly what the sender saw.
 */

interface Props {
  answer: CardAnswer;
  /** Where this view came from, recorded on every event fired from the card. */
  src?: string | null;
  initiallySaved?: boolean;
  showShare?: boolean;
}

export function AnswerCard({ answer, src = null, initiallySaved = false, showShare = true }: Props) {
  const { creator } = answer;
  const [saved, setSaved] = useState(initiallySaved);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'helpful' | 'not_helpful' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setSaved(initiallySaved), [initiallySaved]);

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    await fetch('/api/saves', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: getVisitorId(), answerId: answer.id, src }),
    }).catch(() => setSaved(!next));
  }

  async function share() {
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    const parentShareId = params.get('share');
    const response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answerId: answer.id, visitorId: getVisitorId(), parentShareId }),
    });
    const data = (await response.json()) as { url?: string };
    if (!data.url) return;
    setShareUrl(data.url);
    if (navigator.share) {
      await navigator.share({ title: `${creator.name}'s pick`, url: data.url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(data.url).catch(() => {});
    setCopied(true);
  }

  function rate(type: 'helpful' | 'not_helpful') {
    setFeedback(type);
    void logEvent({ type, answerId: answer.id, creatorSlug: creator.slug, src });
  }

  return (
    <article className="card rise overflow-hidden" style={{ ['--accent' as string]: creator.accent }}>
      <div className="border-b border-line px-5 py-4">
        <VoicePlayer
          text={answer.renderedText}
          audioUrl={answer.audioUrl}
          name={creator.name}
          accent={creator.accent}
        />
      </div>

      <div className="space-y-5 px-5 py-5">
        <p className="text-[17px] leading-relaxed">{answer.renderedText}</p>

        {answer.picks.length > 0 ? (
          <ul className="space-y-2">
            {answer.picks.map((pick) => (
              <li key={pick.unitId} className="rounded-xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-medium">{pick.itemName ?? 'Her answer'}</span>
                  {pick.priceGbp !== null ? (
                    <span className="text-muted">£{pick.priceGbp}</span>
                  ) : null}
                  {pick.score !== null ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ background: creator.accent }}
                    >
                      {pick.score.toFixed(1)}/10
                    </span>
                  ) : null}
                  {pick.verdict ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium">
                      {VERDICT_LABEL[pick.verdict] ?? pick.verdict}
                    </span>
                  ) : null}
                </div>
                {pick.note ? <p className="mt-1 text-sm text-muted">{pick.note}</p> : null}
                {pick.caveat ? (
                  <p className="mt-1 text-sm" style={{ color: creator.accent }}>
                    {pick.caveat}
                  </p>
                ) : null}
                <p className="label mt-2">Source: {pick.sourceRef}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <section className="rounded-xl bg-paper px-4 py-3">
          <h3 className="label">The rule that fired</h3>
          <ul className="mt-2 space-y-2">
            {answer.firedRules.length === 0 ? (
              <li className="text-sm text-muted">No rule fired — this came straight from her notes.</li>
            ) : (
              answer.firedRules.map((rule) => (
                <li key={rule.id} className="text-sm">
                  <span className="font-mono text-[11px] text-muted">{rule.id}</span>
                  <p>{rule.text}</p>
                </li>
              ))
            )}
          </ul>
        </section>

        {answer.skipNotes.length > 0 ? (
          <section className="rounded-xl border border-dashed border-line px-4 py-3">
            <h3 className="label">What she would skip</h3>
            <ul className="mt-2 space-y-1.5">
              {answer.skipNotes.map((note, index) => (
                <li key={`${note.item_id ?? 'x'}-${index}`} className="text-sm">
                  <span className="font-medium">{note.item_name}:</span> {note.text}
                  {note.rule_id ? (
                    <span className="ml-1 font-mono text-[11px] text-muted">{note.rule_id}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <DisclosureBadge creator={creator} answerId={answer.id} src={src} />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-quiet" onClick={toggleSave} aria-pressed={saved}>
            {saved ? 'Saved' : 'Save'}
          </button>
          {showShare ? (
            <button type="button" className="btn btn-quiet" onClick={share}>
              Share
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => rate('helpful')}
            aria-pressed={feedback === 'helpful'}
          >
            Helpful
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => rate('not_helpful')}
            aria-pressed={feedback === 'not_helpful'}
          >
            Not helpful
          </button>
        </div>

        {shareUrl ? (
          <p className="text-sm text-muted">
            {copied ? 'Link copied: ' : 'Share link: '}
            <a className="underline" href={shareUrl}>
              {shareUrl}
            </a>
          </p>
        ) : null}
      </div>
    </article>
  );
}
