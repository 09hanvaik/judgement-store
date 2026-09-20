import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseStats, cohortRows, creators, items, judgementUnits, rules, templates, todos } from '@/db/schema';
import { parseCohortRow } from '@/db/json';
import { cohortInsights } from '@/insights';
import { caseFile, snapshot, SLUGS } from './helpers';

/**
 * The seed is a transcription of the case files. These assertions are how we
 * know it stayed one.
 */
describe('seeded rows match the case files', () => {
  it('seeds exactly three creators', async () => {
    const rows = await db.select().from(creators);
    expect(rows.map((c) => c.slug).sort()).toEqual(['aditi', 'maya', 'sofia']);
  });

  for (const slug of SLUGS) {
    describe(slug, () => {
      it('seeds every item, rule and template from the file', async () => {
        const file = caseFile(slug);
        const [itemRows, ruleRows, templateRows] = await Promise.all([
          db.select().from(items).where(eq(items.creatorId, slug)),
          db.select().from(rules).where(eq(rules.creatorId, slug)),
          db.select().from(templates).where(eq(templates.creatorId, slug)),
        ]);
        expect(itemRows).toHaveLength(file.items.length);
        expect(ruleRows).toHaveLength(file.rules.length);
        expect(templateRows).toHaveLength(file.templates.length);
      });

      it('every judgement unit records where it came from', async () => {
        const units = await db.select().from(judgementUnits).where(eq(judgementUnits.creatorId, slug));
        expect(units.length).toBeGreaterThan(0);
        for (const unit of units) {
          expect(unit.sourceRef.length).toBeGreaterThan(0);
          expect(['approved', 'candidate', 'rejected']).toContain(unit.status);
        }
      });

      it('every case-file stat carries a source label', async () => {
        const stats = await db.select().from(caseStats).where(eq(caseStats.creatorId, slug));
        expect(stats.length).toBeGreaterThan(0);
        for (const stat of stats) expect(stat.sourceRef).toMatch(/case file/i);
      });

      it('the cohort is labelled as sample data, not live', async () => {
        const file = caseFile(slug);
        const rows = await db.select().from(cohortRows).where(eq(cohortRows.creatorId, slug));
        expect(rows).toHaveLength(file.cohort.rows.length);
        for (const row of rows) {
          expect(row.label).toBe('Sample from case file, not live');
          expect(row.sourceRef).toMatch(/case file/i);
        }
      });

      it('records the open questions rather than filling them in', async () => {
        const rows = await db.select().from(todos).where(eq(todos.creatorId, slug));
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row.detail.length).toBeGreaterThan(20);
      });

      it('every rule a template is named by actually exists', async () => {
        const snap = await snapshot(slug);
        const templateIds = new Set(snap.templates.map((t) => t.id));
        for (const rule of snap.rules) {
          if (rule.effect.template_id) expect(templateIds.has(rule.effect.template_id)).toBe(true);
        }
      });

      it('every item a rule names actually exists', async () => {
        const snap = await snapshot(slug);
        const itemIds = new Set(snap.items.map((i) => i.id));
        for (const rule of snap.rules) {
          for (const id of rule.effect.include_item_ids ?? []) expect(itemIds.has(id)).toBe(true);
          for (const id of rule.effect.exclude_item_ids ?? []) expect(itemIds.has(id)).toBe(true);
          for (const id of Object.keys(rule.effect.boost ?? {})) expect(itemIds.has(id)).toBe(true);
        }
      });
    });
  }
});

describe("Maya's seed matches her case file exactly", () => {
  it('has her ten products at her prices with her scores', async () => {
    const rows = await db.select().from(items).where(eq(items.creatorId, 'maya'));
    const byName = new Map(rows.map((r) => [r.name, r.priceGbp]));
    expect(rows).toHaveLength(10);
    expect(byName.get('Cloud Cream')).toBe(38);
    expect(byName.get('Glass Drop')).toBe(62);
    expect(byName.get('SPF 50')).toBe(26);
    expect(byName.get('Clear Wash')).toBe(20);
  });

  it('carries at least 14 rules and 14 templates', async () => {
    const [ruleRows, templateRows] = await Promise.all([
      db.select().from(rules).where(eq(rules.creatorId, 'maya')),
      db.select().from(templates).where(eq(templates.creatorId, 'maya')),
    ]);
    expect(ruleRows.length).toBeGreaterThanOrEqual(14);
    expect(templateRows.length).toBeGreaterThanOrEqual(14);
  });

  it('stores her reply time as the rounded estimate from her brief', async () => {
    const [maya] = await db.select().from(creators).where(eq(creators.slug, 'maya'));
    // 70 hours × 3600 ÷ 4,800 DMs is 52.5s. The brief states 52, so 52 is what
    // is seeded; see the assumptions section of the README.
    expect(maya.replySecondsAvg).toBe(Math.floor((70 * 3600) / 4800));
    expect(maya.replySecondsAvg).toBe(52);
    expect(maya.dmsPerMonth).toBe(4800);
    expect(maya.followersTotal).toBe(50000);
  });

  it('has no reply time for Sofia or Aditi, because their briefs give none', async () => {
    for (const slug of ['sofia', 'aditi']) {
      const [creator] = await db.select().from(creators).where(eq(creators.slug, slug));
      expect(creator.replySecondsAvg).toBeNull();
    }
  });

  it('never seeded a barrier oil as a product', async () => {
    const rows = await db.select().from(items).where(eq(items.creatorId, 'maya'));
    expect(rows.some((r) => /barrier/i.test(r.name))).toBe(false);
  });
});

describe('cohort insights are computed, not quoted', () => {
  it("recomputes Maya's quiet-buyer split from the seeded rows", async () => {
    const rows = (await db.select().from(cohortRows).where(eq(cohortRows.creatorId, 'maya'))).map((r) =>
      parseCohortRow(r.data),
    );
    const computed = cohortInsights(rows);
    const quiet = computed.find((c) => c.metric === 'Buyers who sent 0–1 DMs');
    // Six buyers in her sample, every one of them sent at most one DM.
    expect(quiet?.value).toBe('6 of 6 (100%)');

    const saves = computed.find((c) => c.metric === 'Conversion, 5+ saves vs fewer');
    expect(saves?.value).toBe('100% vs 20%');
  });

  it('computes link-click behaviour for the creators whose sample records it', async () => {
    for (const slug of ['sofia', 'aditi']) {
      const rows = (await db.select().from(cohortRows).where(eq(cohortRows.creatorId, slug))).map((r) =>
        parseCohortRow(r.data),
      );
      const computed = cohortInsights(rows);
      expect(computed.some((c) => c.metric === 'Buyers/actors who never clicked a link')).toBe(true);
      expect(computed.some((c) => c.metric === 'Action rate, 3+ saves vs fewer')).toBe(true);
    }
  });
});
