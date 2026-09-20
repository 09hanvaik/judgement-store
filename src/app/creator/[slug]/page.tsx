import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { todos } from '@/db/schema';
import { computeInsights, type ShareChainNode } from '@/insights';
import { ReplyTimeInput } from '@/components/ReplyTimeInput';
import { MakeNextPanel } from '@/components/MakeNextPanel';
import { creatorBySlug } from '@/lib/store';
import { readCaseFile } from '@/lib/casefile';

export const dynamic = 'force-dynamic';

export default async function CreatorPanel({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();

  const insights = await computeInsights(slug);
  if (!insights) notFound();

  const openTodos = await db.select().from(todos).where(eq(todos.creatorId, creator.id));
  const caseFile = readCaseFile(slug);
  const makeNext = (caseFile?.make_next as { label: string; note: string; posts: Array<{ title: string; views: number; signups: number }> } | undefined) ?? null;
  const { live, sample } = insights;

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-24 pt-10"
      style={{ ['--accent' as string]: creator.accent }}
    >
      <header className="mb-8">
        <p className="label">Creator panel</p>
        <h1 className="text-2xl font-semibold">{creator.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Live numbers come from events this app recorded. Anything from the case file is labelled as
          such and never mixed in.
        </p>
      </header>

      <Section title="Funnel" subtitle="Live — unique visitors at each step">
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {live.funnel.map((step) => (
            <li key={step.step} className="card px-4 py-3">
              <p className="label">{step.step}</p>
              <p className="mt-1 text-2xl font-semibold">{step.visitors}</p>
              <p className="text-xs text-muted">
                {step.conversionFromPrevious === null
                  ? 'start of funnel'
                  : `${step.conversionFromPrevious}% of previous`}
              </p>
            </li>
          ))}
        </ol>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Answers served" value={live.answersServed} />
          <Stat label="Helpful / not" value={`${live.helpful} / ${live.notHelpful}`} />
          <Stat label="No match" value={live.noMatch} />
          <Stat label="Asked her directly" value={live.askDirectlyClicks} />
          <Stat label="Trust signals" value={live.signals.trust} />
          <Stat label="Delayed intent" value={live.signals.delayedIntent} />
          <Stat label="Share views" value={live.shareViews} />
          <Stat label="…arriving via a share" value={live.shareViewsViaShare} />
        </dl>
      </Section>

      <Section title="Questions answered without a DM" subtitle="Live — and what that is worth in hours">
        <p className="text-3xl font-semibold">{live.answersServed}</p>
        <div className="mt-3 rounded-xl bg-paper px-4 py-3 text-sm">
          <p className="label">Time back — estimate</p>
          <p className="mt-1 font-mono text-xs text-muted">{live.timeBack.formula}</p>
          {live.timeBack.needsReplyTime ? (
            <>
              <p className="mt-2">
                No reply-time figure exists in {creator.name.split(' ')[0]}&apos;s brief, so there is no
                number here to show. Set one and it will compute.
              </p>
              <ReplyTimeInput slug={creator.slug} dmsPerMonth={creator.dmsPerMonth} />
            </>
          ) : (
            <p className="mt-2">
              {live.answersServed} × {live.timeBack.replySecondsAvg}s ÷ 3600 ={' '}
              <strong>{live.timeBack.hoursSaved} hours</strong> of replying not done. Reply time is
              itself an estimate from the case file.
            </p>
          )}
        </div>
      </Section>

      <Section title="Share chains" subtitle="Live — who forwarded to whom, and what arrived">
        {live.shareChains.length === 0 ? (
          <p className="text-sm text-muted">
            No shares yet. Share an answer from a card and the chain appears here.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {live.shareChains.map((node) => (
              <ChainNode key={node.id} node={node} depth={0} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">
          Return lag: {live.returnLagDays.median === null
            ? 'no returns recorded yet'
            : `median ${live.returnLagDays.median} days, mean ${live.returnLagDays.mean} (${live.returnLagDays.samples} returns)`}
        </p>
      </Section>

      {makeNext ? <MakeNextPanel data={makeNext} accent={creator.accent} /> : null}

      {sample ? (
        <Section title="Audience cohort" subtitle={sample.label}>
          <p className="mb-3 text-xs text-muted">Source: {sample.sourceRef}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label py-1">Who</th>
                  {sample.rows.some((r) => typeof r.dms === 'number') ? (
                    <th className="label py-1">DMs</th>
                  ) : null}
                  <th className="label py-1">Saves</th>
                  <th className="label py-1">Shares</th>
                  <th className="label py-1">Returns</th>
                  {sample.rows.some((r) => typeof r.link_click === 'boolean') ? (
                    <th className="label py-1">Link click</th>
                  ) : null}
                  <th className="label py-1">Converted</th>
                  <th className="label py-1">Lag (days)</th>
                  {sample.rows.some((r) => typeof r.order_gbp === 'number') ? (
                    <th className="label py-1">Order</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sample.rows.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <td className="py-1.5">{row.label}</td>
                    {sample.rows.some((r) => typeof r.dms === 'number') ? (
                      <td className="py-1.5">{row.dms ?? '—'}</td>
                    ) : null}
                    <td className="py-1.5">{row.saves}</td>
                    <td className="py-1.5">{row.shares}</td>
                    <td className="py-1.5">{row.returns}</td>
                    {sample.rows.some((r) => typeof r.link_click === 'boolean') ? (
                      <td className="py-1.5">{row.link_click === null ? '—' : row.link_click ? 'yes' : 'no'}</td>
                    ) : null}
                    <td className="py-1.5">{row.converted ? 'yes' : 'no'}</td>
                    <td className="py-1.5">{row.lag_days ?? '—'}</td>
                    {sample.rows.some((r) => typeof r.order_gbp === 'number') ? (
                      <td className="py-1.5">{row.order_gbp != null ? `£${row.order_gbp}` : '—'}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-2">
            {sample.computed.map((item) => (
              <li key={item.metric} className="rounded-xl border border-line px-4 py-3">
                <p className="label">{item.metric}</p>
                <p className="text-lg font-medium">{item.value}</p>
                <p className="text-xs text-muted">Computed from the sample: {item.basis}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Case-file headline stats" subtitle="Quoted from the brief, not measured here">
        <ul className="space-y-2">
          {insights.caseStats.map((stat) => (
            <li key={stat.stat} className="rounded-xl border border-dashed border-line px-4 py-3">
              <p className="text-sm">
                <strong>{stat.value}</strong> — {stat.stat}
              </p>
              <p className="text-xs text-muted">Source: {stat.sourceRef}</p>
            </li>
          ))}
        </ul>
      </Section>

      {openTodos.length > 0 ? (
        <Section title="Open questions for her" subtitle="Nothing here has been guessed at">
          <ul className="space-y-2">
            {openTodos.map((todo) => (
              <li key={todo.id} className="rounded-xl border border-line px-4 py-3">
                <p className="font-medium">{todo.topic}</p>
                <p className="text-sm text-muted">{todo.detail}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href={`/creator/${creator.slug}/review`}>
          Review queue
        </Link>
        <Link className="underline underline-offset-2" href={`/c/${creator.slug}`}>
          Audience view
        </Link>
      </nav>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <dt className="label">{label}</dt>
      <dd className="text-lg font-medium">{value}</dd>
    </div>
  );
}

function ChainNode({ node, depth }: { node: ShareChainNode; depth: number }) {
  return (
    <li>
      <div style={{ paddingLeft: depth * 16 }}>
        <span className="font-mono text-xs text-muted">{node.id}</span>{' '}
        <Link className="underline underline-offset-2" href={`/a/${node.answerId}`}>
          {node.answerId}
        </Link>{' '}
        <span className="text-muted">· {node.views} view{node.views === 1 ? '' : 's'}</span>
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <ChainNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
