import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { answers, caseStats, cohortRows, creators, events, shares, visitors } from '@/db/schema';
import { parseCohortRow, parsePayload } from '@/db/json';
import type { CohortRow } from '@/lib/types';

/**
 * Two kinds of number live here and they are never mixed:
 *   - live: computed from the events this app actually recorded;
 *   - sample: computed from the seeded case-file cohort, always labelled.
 * Headline stats quoted from the briefs are passed through with their source.
 */

export interface FunnelStep {
  step: string;
  visitors: number;
  conversionFromPrevious: number | null;
}

export interface ShareChainNode {
  id: string;
  answerId: string;
  createdAt: string;
  views: number;
  children: ShareChainNode[];
}

export interface Insights {
  creator: { slug: string; name: string; replySecondsAvg: number | null; dmsPerMonth: number };
  live: {
    funnel: FunnelStep[];
    answersServed: number;
    uniqueVisitors: number;
    saves: number;
    shares: number;
    shareViews: number;
    shareViewsViaShare: number;
    returnVisits: number;
    helpful: number;
    notHelpful: number;
    noMatch: number;
    askDirectlyClicks: number;
    signals: { trust: number; delayedIntent: number };
    returnLagDays: { median: number | null; mean: number | null; samples: number };
    shareChains: ShareChainNode[];
    timeBack: {
      answersServed: number;
      replySecondsAvg: number | null;
      hoursSaved: number | null;
      formula: string;
      label: 'estimate';
      needsReplyTime: boolean;
    };
  };
  sample: {
    label: string;
    sourceRef: string;
    rows: CohortRow[];
    computed: Array<{ metric: string; value: string; basis: string }>;
  } | null;
  caseStats: Array<{ stat: string; value: string; sourceRef: string }>;
}

const round = (value: number, places = 1) => Number(value.toFixed(places));

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[mid - 1] + sorted[mid]) / 2, 2) : round(sorted[mid], 2);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length, 2);
}

function percent(part: number, whole: number): string {
  if (whole === 0) return 'no rows';
  return `${round((part / whole) * 100, 0)}%`;
}

/** Computed from the seeded rows every time — never hard-coded from the brief. */
export function cohortInsights(rows: CohortRow[]): Array<{ metric: string; value: string; basis: string }> {
  if (rows.length === 0) return [];
  const out: Array<{ metric: string; value: string; basis: string }> = [];

  const converted = rows.filter((r) => r.converted);
  const hasDms = rows.some((r) => typeof r.dms === 'number');
  const hasLinkClick = rows.some((r) => typeof r.link_click === 'boolean');
  const hasOrderValue = rows.some((r) => typeof r.order_gbp === 'number');

  if (hasDms) {
    const quiet = converted.filter((r) => (r.dms ?? 0) <= 1);
    out.push({
      metric: 'Buyers who sent 0–1 DMs',
      value: `${quiet.length} of ${converted.length} (${percent(quiet.length, converted.length)})`,
      basis: 'converted rows where dms <= 1',
    });
    const loud = rows.filter((r) => (r.dms ?? 0) >= 2);
    out.push({
      metric: 'Conversion rate, 2+ DMs vs 0–1 DMs',
      value: `${percent(loud.filter((r) => r.converted).length, loud.length)} vs ${percent(
        rows.filter((r) => (r.dms ?? 0) <= 1 && r.converted).length,
        rows.filter((r) => (r.dms ?? 0) <= 1).length,
      )}`,
      basis: 'split on dms >= 2',
    });
  }

  if (hasLinkClick) {
    const noClick = converted.filter((r) => r.link_click === false);
    out.push({
      metric: 'Buyers/actors who never clicked a link',
      value: `${noClick.length} of ${converted.length} (${percent(noClick.length, converted.length)})`,
      basis: 'converted rows where link_click is false',
    });
  }

  const lags = converted.map((r) => r.lag_days).filter((v): v is number => typeof v === 'number');
  out.push({
    metric: 'Average days to buy/act',
    value: lags.length ? `${mean(lags)} days (median ${median(lags)})` : 'no rows',
    basis: 'converted rows with a recorded lag',
  });

  const high = rows.filter((r) => r.saves >= (hasOrderValue ? 5 : 3));
  const low = rows.filter((r) => r.saves < (hasOrderValue ? 5 : 3));
  out.push({
    metric: hasOrderValue ? 'Conversion, 5+ saves vs fewer' : 'Action rate, 3+ saves vs fewer',
    value: `${percent(high.filter((r) => r.converted).length, high.length)} vs ${percent(
      low.filter((r) => r.converted).length,
      low.length,
    )}`,
    basis: hasOrderValue ? 'split on saves >= 5' : 'split on saves >= 3',
  });

  if (hasOrderValue) {
    const highValues = high.map((r) => r.order_gbp).filter((v): v is number => typeof v === 'number');
    const lowValues = low.map((r) => r.order_gbp).filter((v): v is number => typeof v === 'number');
    out.push({
      metric: 'Average order, 5+ saves vs fewer',
      value: `${highValues.length ? `£${mean(highValues)}` : 'no rows'} vs ${
        lowValues.length ? `£${mean(lowValues)}` : 'no rows'
      }`,
      basis: 'converted rows with an order value',
    });
  }

  return out;
}

function buildChains(rows: Array<{ id: string; answerId: string; parentShareId: string | null; createdAt: string }>, views: Map<string, number>): ShareChainNode[] {
  const nodes = new Map<string, ShareChainNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      answerId: row.answerId,
      createdAt: row.createdAt,
      views: views.get(row.id) ?? 0,
      children: [],
    });
  }
  const roots: ShareChainNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parent = row.parentShareId ? nodes.get(row.parentShareId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function computeInsights(slug: string): Promise<Insights | null> {
  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return null;

  const [eventRows, shareRows, cohort, stats, visitorRows, answerRows] = await Promise.all([
    db.select().from(events).where(eq(events.creatorId, creator.id)),
    db.select().from(shares),
    db.select().from(cohortRows).where(eq(cohortRows.creatorId, creator.id)),
    db.select().from(caseStats).where(eq(caseStats.creatorId, creator.id)),
    db.select().from(visitors),
    db.select().from(answers).where(eq(answers.creatorId, creator.id)),
  ]);

  const answerIds = new Set(answerRows.map((a) => a.id));
  const creatorShares = shareRows.filter((s) => answerIds.has(s.answerId));

  const byType = (type: string) => eventRows.filter((e) => e.type === type);
  const uniqueVisitorsOf = (type: string) => new Set(byType(type).map((e) => e.visitorId));

  const viewed = uniqueVisitorsOf('answer_viewed');
  const saved = new Set([...uniqueVisitorsOf('save')].filter((v) => viewed.has(v)));
  const shared = new Set([...uniqueVisitorsOf('share')].filter((v) => viewed.has(v)));
  const returned = uniqueVisitorsOf('return_visit');

  const funnel: FunnelStep[] = [
    { step: 'Answer viewed', visitors: viewed.size, conversionFromPrevious: null },
    {
      step: 'Saved',
      visitors: saved.size,
      conversionFromPrevious: viewed.size ? round((saved.size / viewed.size) * 100, 1) : null,
    },
    {
      step: 'Shared',
      visitors: shared.size,
      conversionFromPrevious: saved.size ? round((shared.size / saved.size) * 100, 1) : null,
    },
    {
      step: 'Returned',
      visitors: returned.size,
      conversionFromPrevious: shared.size ? round((returned.size / shared.size) * 100, 1) : null,
    },
  ];

  const shareViewEvents = byType('share_view');
  const viewsByShare = new Map<string, number>();
  for (const event of shareViewEvents) {
    const shareId = parsePayload(event.payload).share_id;
    if (typeof shareId === 'string') viewsByShare.set(shareId, (viewsByShare.get(shareId) ?? 0) + 1);
  }

  // Return lag, measured from when this browser was first seen at all.
  const firstSeenById = new Map(visitorRows.map((v) => [v.id, v.firstSeen]));
  const lagDays: number[] = [];
  for (const event of byType('return_visit')) {
    const payloadDays = parsePayload(event.payload).days_since_first_seen;
    if (typeof payloadDays === 'number') {
      lagDays.push(payloadDays);
      continue;
    }
    const firstSeen = firstSeenById.get(event.visitorId);
    if (firstSeen) lagDays.push(round((new Date(event.ts).getTime() - new Date(firstSeen).getTime()) / 86_400_000, 3));
  }

  const answersServed = byType('answer_viewed').length;
  const replySecondsAvg = creator.replySecondsAvg;
  const hoursSaved = replySecondsAvg === null ? null : round((answersServed * replySecondsAvg) / 3600, 2);

  const cohortParsed = cohort.map((row) => parseCohortRow(row.data));

  return {
    creator: {
      slug: creator.slug,
      name: creator.name,
      replySecondsAvg,
      dmsPerMonth: creator.dmsPerMonth,
    },
    live: {
      funnel,
      answersServed,
      uniqueVisitors: new Set(eventRows.map((e) => e.visitorId)).size,
      saves: byType('save').length,
      shares: byType('share').length,
      shareViews: shareViewEvents.length,
      shareViewsViaShare: shareViewEvents.filter((e) => e.src === 'share').length,
      returnVisits: byType('return_visit').length,
      helpful: byType('helpful').length,
      notHelpful: byType('not_helpful').length,
      noMatch: byType('no_match').length,
      askDirectlyClicks: byType('ask_directly_click').length,
      signals: {
        trust: byType('signal_trust').length,
        delayedIntent: byType('signal_delayed_intent').length,
      },
      returnLagDays: { median: median(lagDays), mean: mean(lagDays), samples: lagDays.length },
      shareChains: buildChains(creatorShares, viewsByShare),
      timeBack: {
        answersServed,
        replySecondsAvg,
        hoursSaved,
        formula: 'answers_served × reply_seconds_avg ÷ 3600',
        label: 'estimate',
        needsReplyTime: replySecondsAvg === null,
      },
    },
    sample:
      cohort.length > 0
        ? {
            label: cohort[0].label,
            sourceRef: cohort[0].sourceRef,
            rows: cohortParsed,
            computed: cohortInsights(cohortParsed),
          }
        : null,
    caseStats: stats.map((s) => ({ stat: s.stat, value: s.value, sourceRef: s.sourceRef })),
  };
}
