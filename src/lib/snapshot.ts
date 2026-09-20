import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { creators, items, judgementUnits, rules, templates } from '@/db/schema';
import {
  parseAttrs,
  parseConditions,
  parseEffect,
  parseModeScope,
  parseSituation,
  parseStringArray,
  parseStyleGuide,
} from '@/db/json';
import type { Snapshot } from '@/engine/snapshot';
import type { Mode, UnitStatus, Verdict } from './types';

/** Reads one creator's whole judgement store and hands the engine a plain object. */
export async function loadSnapshot(slug: string): Promise<Snapshot | null> {
  const [creator] = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  if (!creator) return null;

  const [itemRows, unitRows, ruleRows, templateRows] = await Promise.all([
    db.select().from(items).where(eq(items.creatorId, creator.id)),
    db.select().from(judgementUnits).where(eq(judgementUnits.creatorId, creator.id)),
    db.select().from(rules).where(eq(rules.creatorId, creator.id)),
    db.select().from(templates).where(eq(templates.creatorId, creator.id)),
  ]);

  return {
    creator: {
      id: creator.id,
      slug: creator.slug,
      name: creator.name,
      niche: creator.niche,
      disclosureText: creator.disclosureText,
      replySecondsAvg: creator.replySecondsAvg,
      accent: creator.accent,
      styleGuide: parseStyleGuide(creator.styleGuide),
    },
    items: itemRows
      .map((row) => ({
        id: row.id,
        creatorId: row.creatorId,
        kind: row.kind,
        name: row.name,
        priceGbp: row.priceGbp,
        attrs: parseAttrs(row.attrs),
        isAvailable: row.isAvailable,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    units: unitRows
      .map((row) => ({
        id: row.id,
        creatorId: row.creatorId,
        itemId: row.itemId,
        mode: row.mode as Mode,
        situation: parseSituation(row.situation),
        verdict: row.verdict as Verdict,
        score: row.score,
        ruleId: row.ruleId,
        ruleText: row.ruleText,
        caveat: row.caveat,
        note: row.note,
        voiceSample: row.voiceSample,
        audioUrl: row.audioUrl,
        sourceRef: row.sourceRef,
        status: row.status as UnitStatus,
        priority: row.priority,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    rules: ruleRows
      .map((row) => ({
        id: row.id,
        creatorId: row.creatorId,
        modeScope: parseModeScope(row.modeScope),
        conditions: parseConditions(row.conditions),
        effect: parseEffect(row.effect),
        ruleText: row.ruleText,
        weight: row.weight,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    templates: templateRows
      .map((row) => ({
        id: row.id,
        creatorId: row.creatorId,
        mode: row.mode as Mode,
        slots: parseStringArray(row.slots),
        text: row.text,
        audioKey: row.audioKey,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
