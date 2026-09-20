import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  answers,
  creators,
  events,
  items,
  judgementUnits,
  rules,
  saves,
  shares,
  visitors,
} from '@/db/schema';
import {
  parseAnswerQuery,
  parseAttrs,
  parseSkipNotes,
  parseStringArray,
  parseStyleGuide,
  parseVisitorContext,
  toJson,
} from '@/db/json';
import type { EventType, SkipNote, VisitorContext } from './types';
import type { RouterAnswer } from '@/engine/router';

const now = () => new Date().toISOString();

export function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Visitors are anonymous ids only — no accounts, no personal data. */
export async function touchVisitor(visitorId: string, context?: VisitorContext) {
  const [existing] = await db.select().from(visitors).where(eq(visitors.id, visitorId)).limit(1);
  if (!existing) {
    const ts = now();
    await db.insert(visitors).values({
      id: visitorId,
      firstSeen: ts,
      lastSeen: ts,
      context: toJson(context ?? {}),
    });
    return { firstSeen: ts, isNew: true as const };
  }
  await db
    .update(visitors)
    .set({
      lastSeen: now(),
      context: toJson({ ...parseVisitorContext(existing.context), ...(context ?? {}) }),
    })
    .where(eq(visitors.id, visitorId));
  return { firstSeen: existing.firstSeen, isNew: false as const };
}

export async function logEvent(input: {
  type: EventType;
  visitorId: string;
  creatorId: string;
  answerId?: string | null;
  payload?: Record<string, unknown>;
  src?: string | null;
}) {
  const row = {
    id: randomId('ev'),
    visitorId: input.visitorId,
    creatorId: input.creatorId,
    answerId: input.answerId ?? null,
    type: input.type,
    payload: toJson(input.payload ?? {}),
    src: input.src ?? null,
    ts: now(),
  };
  await db.insert(events).values(row);
  return row;
}

/** Answers are immutable and content-addressed: the same question reuses the row. */
export async function persistAnswer(answer: RouterAnswer, audioUrl: string | null) {
  const [existing] = await db.select().from(answers).where(eq(answers.id, answer.id)).limit(1);
  if (existing) return existing;
  const row = {
    id: answer.id,
    creatorId: answer.creatorId,
    query: toJson(answer.query),
    unitIds: toJson(answer.unitIds),
    itemIds: toJson(answer.itemIds),
    ruleIds: toJson(answer.ruleIds),
    renderedText: answer.renderedText,
    skipNotes: toJson(answer.skipNotes),
    audioUrl,
    createdAt: now(),
  };
  await db.insert(answers).values(row).onConflictDoNothing();
  return row;
}

export interface AnswerDetail {
  id: string;
  creator: {
    slug: string;
    name: string;
    accent: string;
    disclosureText: string;
    niche: string;
  };
  mode: string;
  rawText: string;
  renderedText: string;
  skipNotes: SkipNote[];
  audioUrl: string | null;
  audioKey: string;
  createdAt: string;
  picks: Array<{
    unitId: string;
    itemId: string | null;
    itemName: string | null;
    priceGbp: number | null;
    kind: string | null;
    verdict: string | null;
    score: number | null;
    note: string;
    caveat: string;
    voiceSample: string | null;
    sourceRef: string;
    ruleId: string | null;
    ruleText: string;
  }>;
  firedRules: Array<{ id: string; text: string }>;
}

/** Rebuild a stored answer for display. Nothing is re-routed and nothing re-renders. */
export async function loadAnswer(id: string): Promise<AnswerDetail | null> {
  const [row] = await db.select().from(answers).where(eq(answers.id, id)).limit(1);
  if (!row) return null;
  const [creator] = await db.select().from(creators).where(eq(creators.id, row.creatorId)).limit(1);
  if (!creator) return null;

  const unitIds = parseStringArray(row.unitIds);
  const ruleIds = parseStringArray(row.ruleIds);
  const itemIds = parseStringArray(row.itemIds);

  const unitRows = unitIds.length
    ? await db.select().from(judgementUnits).where(inArray(judgementUnits.id, unitIds))
    : [];
  const itemRows = itemIds.length ? await db.select().from(items).where(inArray(items.id, itemIds)) : [];
  const ruleRows = ruleIds.length ? await db.select().from(rules).where(inArray(rules.id, ruleIds)) : [];

  const itemById = new Map(itemRows.map((i) => [i.id, i]));
  const query = parseAnswerQuery(row.query);

  return {
    id: row.id,
    creator: {
      slug: creator.slug,
      name: creator.name,
      accent: creator.accent,
      disclosureText: creator.disclosureText,
      niche: creator.niche,
    },
    mode: query.mode,
    rawText: query.raw_text,
    renderedText: row.renderedText,
    skipNotes: parseSkipNotes(row.skipNotes),
    audioUrl: row.audioUrl,
    audioKey: row.audioUrl ? row.audioUrl.replace(/^.*\/(.*)\.mp3$/, '$1') : '',
    createdAt: row.createdAt,
    picks: unitIds
      .map((unitId) => unitRows.find((u) => u.id === unitId))
      .filter((u): u is (typeof unitRows)[number] => Boolean(u))
      .map((unit) => {
        const item = unit.itemId ? itemById.get(unit.itemId) : undefined;
        return {
          unitId: unit.id,
          itemId: unit.itemId,
          itemName: item?.name ?? null,
          priceGbp: item?.priceGbp ?? null,
          kind: item?.kind ?? null,
          verdict: unit.verdict,
          score: unit.score,
          note: unit.note,
          caveat: unit.caveat,
          voiceSample: unit.voiceSample,
          sourceRef: unit.sourceRef,
          ruleId: unit.ruleId,
          ruleText: unit.ruleText,
        };
      }),
    firedRules: ruleIds.map((ruleId) => {
      const rule = ruleRows.find((r) => r.id === ruleId);
      return { id: ruleId, text: rule?.ruleText ?? coreRuleText(ruleId) };
    }),
  };
}

/** Structural rules live in the engine rather than any creator's table. */
function coreRuleText(ruleId: string): string {
  if (ruleId === 'R-CORE-OWNED') return 'She never re-sells you something you already own.';
  if (ruleId === 'R-CORE-REFERENCED')
    return 'You named a specific thing, so the answer is about that thing and nothing else.';
  return 'Rule text unavailable.';
}

export async function creatorBySlug(slug: string) {
  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return null;
  return { ...creator, styleGuideParsed: parseStyleGuide(creator.styleGuide) };
}

export async function listSaves(visitorId: string) {
  const rows = await db
    .select()
    .from(saves)
    .where(eq(saves.visitorId, visitorId))
    .orderBy(desc(saves.createdAt));
  return rows;
}

export async function addSave(visitorId: string, answerId: string) {
  const [existing] = await db
    .select()
    .from(saves)
    .where(and(eq(saves.visitorId, visitorId), eq(saves.answerId, answerId)))
    .limit(1);
  if (existing) return existing;
  const row = { id: randomId('sv'), visitorId, answerId, createdAt: now() };
  await db.insert(saves).values(row).onConflictDoNothing();
  return row;
}

export async function removeSave(visitorId: string, answerId: string) {
  await db.delete(saves).where(and(eq(saves.visitorId, visitorId), eq(saves.answerId, answerId)));
}

export async function createShare(input: {
  answerId: string;
  sharerVisitorId: string;
  parentShareId?: string | null;
}) {
  const row = {
    id: randomId('sh'),
    answerId: input.answerId,
    sharerVisitorId: input.sharerVisitorId,
    parentShareId: input.parentShareId ?? null,
    createdAt: now(),
  };
  await db.insert(shares).values(row);
  return row;
}

export async function getShare(id: string) {
  const [row] = await db.select().from(shares).where(eq(shares.id, id)).limit(1);
  return row ?? null;
}

export async function itemAttrs(itemId: string) {
  const [row] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  return row ? parseAttrs(row.attrs) : {};
}
