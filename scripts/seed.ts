import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { getClient } from '../src/db/client';

config({ path: '.env.local', quiet: true });

/**
 * Deterministic seed. Every row is derived from data/<slug>.json, which is a
 * transcription of the case files — nothing here is invented. Timestamps are
 * fixed so two seeds of the same data produce identical rows.
 */

const SEEDED_AT = '2026-01-01T00:00:00.000Z';
const CREATOR_FILES = ['maya', 'sofia', 'aditi'];

type Json = Record<string, any>;

function load(slug: string): Json {
  return JSON.parse(readFileSync(resolve(`data/${slug}.json`), 'utf8')) as Json;
}

const j = (value: unknown) => JSON.stringify(value ?? null);

function prefixItems(slug: string, ids: string[] | undefined): string[] | undefined {
  if (!ids) return undefined;
  return ids.map((id) => (id.startsWith(`${slug}-i-`) ? id : `${slug}-i-${id}`));
}

function prefixBoost(slug: string, boost: Record<string, number> | undefined) {
  if (!boost) return undefined;
  return Object.fromEntries(
    Object.entries(boost).map(([id, n]) => [id.startsWith(`${slug}-i-`) ? id : `${slug}-i-${id}`, n]),
  );
}

async function main() {
  const client = getClient();
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const counts: Record<string, number> = {};
  const bump = (table: string) => (counts[table] = (counts[table] ?? 0) + 1);

  for (const slug of CREATOR_FILES) {
    if (!existsSync(resolve(`data/${slug}.json`))) {
      console.log(`  (no data/${slug}.json yet — skipped)`);
      continue;
    }
    const data = load(slug);
    const c = data.creator;

    statements.push({
      sql: `INSERT INTO creators (id, slug, name, niche, handle_summary, followers_total, dms_per_month,
              reply_seconds_avg, voice_id, portrait_url, accent, disclosure_text, style_guide, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        slug,
        slug,
        c.name,
        c.niche,
        c.handle_summary,
        c.followers_total,
        c.dms_per_month,
        c.reply_seconds_avg ?? null,
        c.voice_id ?? null,
        c.portrait_url ?? null,
        c.accent ?? '#12100E',
        c.disclosure_text,
        j(c.style_guide),
        SEEDED_AT,
      ],
    });
    bump('creators');

    for (const item of data.items ?? []) {
      const itemId = `${slug}-i-${item.id}`;
      statements.push({
        sql: `INSERT INTO items (id, creator_id, kind, name, price_gbp, attrs, is_available, created_at)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [
          itemId,
          slug,
          item.kind,
          item.name,
          item.price_gbp ?? null,
          j(item.attrs ?? {}),
          item.is_available === false ? 0 : 1,
          SEEDED_AT,
        ],
      });
      bump('items');

      for (const [mode, raw] of Object.entries<Json>(item.units ?? {})) {
        const unit = raw ?? {};
        statements.push({
          sql: `INSERT INTO judgement_units (id, creator_id, item_id, mode, situation, verdict, score, rule_id,
                  rule_text, caveat, note, voice_sample, audio_url, source_ref, status, priority, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            `${slug}-u-${item.id}-${mode}`,
            slug,
            itemId,
            mode,
            j(unit.situation ?? {}),
            unit.verdict ?? null,
            'score' in unit ? unit.score : (item.score ?? null),
            unit.rule_id ?? null,
            unit.rule_text ?? '',
            unit.caveat ?? '',
            unit.note ?? item.note ?? '',
            unit.voice_sample ?? item.note ?? null,
            null,
            unit.source_ref ?? item.source_ref ?? `case file: ${c.name} notes`,
            unit.status ?? item.status ?? 'approved',
            unit.priority ?? 0,
            SEEDED_AT,
          ],
        });
        bump('judgement_units');
      }
    }

    for (const unit of data.extra_units ?? []) {
      statements.push({
        sql: `INSERT INTO judgement_units (id, creator_id, item_id, mode, situation, verdict, score, rule_id,
                rule_text, caveat, note, voice_sample, audio_url, source_ref, status, priority, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          `${slug}-u-${unit.id}`,
          slug,
          unit.item_id ? `${slug}-i-${unit.item_id}` : null,
          unit.mode,
          j(unit.situation ?? {}),
          unit.verdict ?? null,
          unit.score ?? null,
          unit.rule_id ?? null,
          unit.rule_text ?? '',
          unit.caveat ?? '',
          unit.note ?? '',
          unit.voice_sample ?? null,
          null,
          unit.source_ref ?? `case file: ${c.name} notes`,
          unit.status ?? 'approved',
          unit.priority ?? 0,
          SEEDED_AT,
        ],
      });
      bump('judgement_units');
    }

    for (const rule of data.rules ?? []) {
      const effect = { ...(rule.effect ?? {}) };
      effect.include_item_ids = prefixItems(slug, effect.include_item_ids);
      effect.exclude_item_ids = prefixItems(slug, effect.exclude_item_ids);
      effect.boost = prefixBoost(slug, effect.boost);
      statements.push({
        sql: `INSERT INTO rules (id, creator_id, mode_scope, conditions, effect, rule_text, weight, created_at)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [rule.id, slug, j(rule.mode_scope ?? []), j(rule.conditions ?? []), j(effect), rule.rule_text, rule.weight ?? 0, SEEDED_AT],
      });
      bump('rules');
    }

    for (const template of data.templates ?? []) {
      statements.push({
        sql: `INSERT INTO templates (id, creator_id, mode, slots, text, audio_key) VALUES (?,?,?,?,?,?)`,
        args: [template.id, slug, template.mode, j(template.slots ?? []), template.text, template.audio_key],
      });
      bump('templates');
    }

    const cohort = data.cohort;
    if (cohort) {
      (cohort.rows ?? []).forEach((row: Json, index: number) => {
        statements.push({
          sql: `INSERT INTO cohort_rows (id, creator_id, label, data, source_ref) VALUES (?,?,?,?,?)`,
          args: [`${slug}-cohort-${index}`, slug, cohort.label, j(row), cohort.source_ref],
        });
        bump('cohort_rows');
      });
    }

    (data.case_stats ?? []).forEach((stat: Json, index: number) => {
      statements.push({
        sql: `INSERT INTO case_stats (id, creator_id, stat, value, source_ref) VALUES (?,?,?,?,?)`,
        args: [`${slug}-stat-${index}`, slug, stat.stat, stat.value, stat.source_ref],
      });
      bump('case_stats');
    });

    (data.todos ?? []).forEach((todo: Json, index: number) => {
      statements.push({
        sql: `INSERT INTO todos (id, creator_id, topic, detail, status) VALUES (?,?,?,?,?)`,
        args: [`${slug}-todo-${index}`, slug, todo.topic, todo.detail, 'open'],
      });
      bump('todos');
    });

    (data.candidates ?? []).forEach((candidate: Json, index: number) => {
      statements.push({
        sql: `INSERT INTO candidates (id, creator_id, source_type, raw_text, proposed_unit, status, created_at)
              VALUES (?,?,?,?,?,?,?)`,
        args: [
          `${slug}-cand-${index}`,
          slug,
          candidate.source_type,
          candidate.raw_text,
          j(candidate.proposed_unit),
          'pending',
          SEEDED_AT,
        ],
      });
      bump('candidates');
    });
  }

  await client.batch(
    statements.map((s) => ({ sql: s.sql, args: s.args as never })),
    'write',
  );

  console.log('seeded:');
  for (const [table, count] of Object.entries(counts).sort()) console.log(`  ${table}: ${count}`);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
