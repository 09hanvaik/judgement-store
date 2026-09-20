'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnswerCard } from './AnswerCard';
import { DisclosureBadge } from './DisclosureBadge';
import { getVisitorId, logEvent, markVisit } from '@/lib/visitor';
import type { CardAnswer, CardCreator } from '@/lib/card';
import type { DemoStep } from '@/lib/casefile';

export interface ModeChip {
  label: string;
  mode: string;
}

export const MODE_CHIPS: ModeChip[] = [
  { label: 'Just tell me', mode: 'decide' },
  { label: 'Under a budget', mode: 'budget' },
  { label: 'Only two things', mode: 'narrow' },
  { label: 'What would you buy', mode: 'personal' },
  { label: 'Is it worth it', mode: 'verdict' },
  { label: 'I already have…', mode: 'adapt' },
  { label: 'How do I get there', mode: 'route' },
];

interface AskState {
  kind: 'answer' | 'ask_back' | 'signal' | 'no_match';
  answer?: CardAnswer;
  askBack?: {
    question: string;
    ruleId: string | null;
    ruleText: string;
    options: Array<{ label: string; constraints?: Record<string, unknown> }>;
  };
  signal?: { type: string; text: string; offerSave: boolean };
  noMatch?: { text: string; question: string | null };
}

interface Props {
  creator: CardCreator;
  suggestions: string[];
  demo: { archetype: string; steps: DemoStep[] } | null;
}

export function AskPanel({ creator, suggestions, demo }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<string | null>(null);
  const [state, setState] = useState<AskState | null>(null);
  const [pending, setPending] = useState(false);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Return detection: a second visit to this creator is a signal, not a click.
  useEffect(() => {
    const visit = markVisit(creator.slug);
    if (visit.isReturn) {
      void logEvent({
        type: 'return_visit',
        creatorSlug: creator.slug,
        payload: { days_since_first_seen: visit.daysSince, surface: 'creator_page' },
      });
    }
  }, [creator.slug]);

  const ask = useCallback(
    async (input: {
      text?: string;
      mode?: string | null;
      chips?: string[];
      chipConstraints?: Record<string, unknown>;
    }) => {
      setPending(true);
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            creatorSlug: creator.slug,
            visitorId: getVisitorId(),
            text: input.text ?? '',
            mode: input.mode ?? null,
            chips: input.chips ?? [],
            chipConstraints: input.chipConstraints,
          }),
        });
        const data = (await response.json()) as AskState;
        if (data.kind === 'answer' && data.answer) {
          setState({ kind: 'answer', answer: { ...data.answer, creator } });
        } else {
          setState(data);
        }
        window.requestAnimationFrame(() =>
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        );
      } finally {
        setPending(false);
      }
    },
    [creator],
  );

  async function runDemoStep(index: number) {
    if (!demo) return;
    const step = demo.steps[index];
    setDemoStep(index);
    if (step.text) setText(step.text);
    if (step.mode) setMode(step.mode);
    await ask({
      text: step.text,
      mode: step.mode ?? null,
      chips: step.chips,
      chipConstraints: step.tags ? { tags: step.tags } : undefined,
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="label">What do you need decided?</h2>
        <div className="flex flex-wrap gap-2">
          {MODE_CHIPS.map((chip) => (
            <button
              key={chip.mode}
              type="button"
              className="chip"
              data-active={mode === chip.mode}
              onClick={() => {
                const next = mode === chip.mode ? null : chip.mode;
                setMode(next);
                if (next) void ask({ text, mode: next, chips: [chip.label] });
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) void ask({ text, mode });
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Ask ${creator.name.split(' ')[0]} in your own words`}
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-base outline-none focus:border-ink"
            aria-label="Your question"
          />
          <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()}>
            {pending ? '…' : 'Ask'}
          </button>
        </form>

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip text-left"
                onClick={() => {
                  setText(suggestion);
                  void ask({ text: suggestion, mode });
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {demo ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-3">
            <p className="label">Demo mode — {demo.archetype}&apos;s three taps</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {demo.steps.map((step, index) => (
                <button
                  key={step.label}
                  type="button"
                  className="chip"
                  data-active={demoStep === index}
                  disabled={pending}
                  onClick={() => void runDemoStep(index)}
                >
                  {index + 1}. {step.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div ref={resultRef} className="space-y-4">
        {state?.kind === 'answer' && state.answer ? (
          <AnswerCard answer={state.answer} src="direct" />
        ) : null}

        {state?.kind === 'ask_back' && state.askBack ? (
          <section className="card rise space-y-4 px-5 py-5">
            <h3 className="text-[17px] font-medium">{state.askBack.question}</h3>
            <div className="flex flex-wrap gap-2">
              {state.askBack.options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="chip"
                  onClick={() =>
                    void ask({
                      text,
                      mode,
                      chips: [option.label],
                      chipConstraints: option.constraints,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <section className="rounded-xl bg-paper px-4 py-3">
              <h4 className="label">The rule that fired</h4>
              <p className="mt-1 text-sm">
                {state.askBack.ruleId ? (
                  <span className="mr-2 font-mono text-[11px] text-muted">{state.askBack.ruleId}</span>
                ) : null}
                {state.askBack.ruleText}
              </p>
            </section>
            <DisclosureBadge creator={creator} src="direct" />
          </section>
        ) : null}

        {state?.kind === 'signal' && state.signal ? (
          <section className="card rise space-y-4 px-5 py-5">
            <p className="text-[17px]">{state.signal.text}</p>
            <p className="label">
              Logged as {state.signal.type.replace('signal_', '').replace('_', ' ')} — no answer invented.
            </p>
            {state.signal.offerSave ? (
              <p className="text-sm text-muted">
                Your picks are on your <a className="underline" href={`/c/${creator.slug}/saves`}>saved list</a>.
              </p>
            ) : null}
            <DisclosureBadge creator={creator} src="direct" />
          </section>
        ) : null}

        {state?.kind === 'no_match' && state.noMatch ? (
          <section className="card rise space-y-4 px-5 py-5">
            <p className="text-[17px]">{state.noMatch.text}</p>
            {state.noMatch.question ? (
              <p className="text-sm text-muted">She would ask: {state.noMatch.question}</p>
            ) : null}
            <DisclosureBadge creator={creator} src="direct" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
