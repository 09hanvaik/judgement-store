'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * The engine showcase. Its whole job is to make the deterministic claim
 * watchable: the same question is routed twice, every stage reports what it
 * produced, and the external-call counter stays at zero.
 */

interface Stage {
  n: number;
  name: string;
  summary: string;
  detail: Record<string, unknown>;
}

interface Trace {
  creator: { slug: string; name: string; accent: string };
  kind: string;
  deterministic: {
    firstId: string | null;
    secondId: string | null;
    identical: boolean;
    firstText: string | null;
    textIdentical: boolean;
  };
  timings: Record<string, number>;
  stages: Stage[];
}

const PROBES = [
  { label: 'Constraints', slug: 'maya', text: 'i have dry skin + redness and £60. tell me what to buy pls' },
  { label: 'Only one', slug: 'maya', text: 'okay but if u could only keep ONE of these which one' },
  { label: 'Worth it', slug: 'maya', text: 'is the cloud cream actually worth £38 or am i being influenced' },
  { label: 'Refuses to guess', slug: 'maya', text: 'Maya I have a first date Friday HELP' },
  { label: 'Not a question', slug: 'maya', text: 'i trust you more than Sephora tbh' },
  { label: 'Owns it already', slug: 'maya', text: 'i already have the night serum. do i need the barrier cream too???' },
  { label: 'Under budget', slug: 'sofia', text: "Anything like this but under £120? I'm not paying £400 lol" },
  { label: 'No verdict on record', slug: 'aditi', text: 'Ok but if you were me, would you take the seed-stage offer or stay put?' },
];

export default function DemoPage() {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (index: number) => {
    const probe = PROBES[index];
    setActive(index);
    setBusy(true);
    setOpen(null);
    try {
      const response = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creatorSlug: probe.slug, text: probe.text }),
      });
      setTrace((await response.json()) as Trace);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(0);
  }, [run]);

  const probe = PROBES[active];
  const accent = trace?.creator.accent ?? '#3B3663';

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-4xl px-4 pb-24 pt-10"
      style={{ ['--accent' as string]: accent }}
    >
      <header className="mb-8 space-y-3">
        <p className="label">Engine showcase</p>
        <h1 className="text-2xl font-semibold">Nine stages, no model, same answer every time</h1>
        <p className="max-w-2xl text-sm text-muted">
          Each question below runs through the real router twice. The stages report what they actually
          produced, and the two runs are compared on id and on text. Nothing is mocked and nothing
          leaves the machine.
        </p>
      </header>

      <section className="mb-6 flex flex-wrap gap-2">
        {PROBES.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className="chip"
            data-active={active === index}
            disabled={busy}
            onClick={() => void run(index)}
          >
            {item.label}
          </button>
        ))}
      </section>

      <p className="mb-6 rounded-xl border border-line bg-white px-4 py-3 text-sm">
        <span className="label mr-2">{probe.slug}</span>
        &ldquo;{probe.text}&rdquo;
      </p>

      {trace ? (
        <>
          <section className="mb-8 grid gap-3 sm:grid-cols-3">
            <div
              className="rounded-xl px-4 py-3 text-white"
              style={{ background: trace.deterministic.identical ? accent : '#8a2c2c' }}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-80">
                Two runs, one answer
              </p>
              <p className="mt-1 font-mono text-lg">{trace.deterministic.firstId ?? trace.kind}</p>
              <p className="mt-0.5 font-mono text-lg opacity-80">{trace.deterministic.secondId ?? trace.kind}</p>
              <p className="mt-1 text-xs opacity-90">
                {trace.deterministic.firstId
                  ? trace.deterministic.identical && trace.deterministic.textIdentical
                    ? 'Identical id and identical text.'
                    : 'Mismatch — determinism broken.'
                  : `Returned ${trace.kind}: no answer was invented.`}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="label">Route time</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{trace.timings.fullRoute} ms</p>
              <p className="text-xs text-muted">replay {trace.timings.replay} ms</p>
            </div>

            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="label">External calls</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{trace.timings.externalCalls}</p>
              <p className="text-xs text-muted">no model, no network</p>
            </div>
          </section>

          <ol className="space-y-2">
            {trace.stages.map((stage) => (
              <li key={stage.n} className="card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-baseline gap-3 px-4 py-3 text-left"
                  onClick={() => setOpen(open === stage.n ? null : stage.n)}
                  aria-expanded={open === stage.n}
                >
                  <span
                    className="font-mono text-xs tabular-nums"
                    style={{ color: accent }}
                  >
                    {String(stage.n).padStart(2, '0')}
                  </span>
                  <span className="w-40 shrink-0 text-sm font-medium">{stage.name}</span>
                  <span className="min-w-0 flex-1 text-sm text-muted">{stage.summary}</span>
                  <span className="text-xs text-muted">{open === stage.n ? '−' : '+'}</span>
                </button>
                {open === stage.n ? (
                  <pre className="overflow-x-auto border-t border-line bg-paper px-4 py-3 text-xs leading-relaxed">
                    {JSON.stringify(stage.detail, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>

          {trace.deterministic.firstText ? (
            <section className="card mt-6 px-5 py-4">
              <p className="label">What she says</p>
              <p className="mt-1 text-[17px] leading-relaxed">{trace.deterministic.firstText}</p>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">Running the pipeline…</p>
      )}

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href="/u/aditi">
          Audience surface
        </Link>
        <Link className="underline underline-offset-2" href="/creator/maya">
          Creator panel
        </Link>
        <Link className="underline underline-offset-2" href="/c/maya">
          Classic answer UI
        </Link>
      </nav>
    </main>
  );
}
