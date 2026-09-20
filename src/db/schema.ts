import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * All JSON-shaped columns are stored as TEXT. Read them through the typed
 * helpers in ./json.ts — never JSON.parse them ad hoc.
 */

export const creators = sqliteTable('creators', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  niche: text('niche').notNull(),
  handleSummary: text('handle_summary').notNull(),
  followersTotal: integer('followers_total').notNull(),
  dmsPerMonth: integer('dms_per_month').notNull(),
  replySecondsAvg: integer('reply_seconds_avg'),
  voiceId: text('voice_id'),
  portraitUrl: text('portrait_url'),
  accent: text('accent').notNull().default('#12100E'),
  personaUrl: text('persona_url'),
  disclosureText: text('disclosure_text').notNull(),
  styleGuide: text('style_guide').notNull(),
  createdAt: text('created_at').notNull(),
});

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    priceGbp: real('price_gbp'),
    attrs: text('attrs').notNull(),
    isAvailable: integer('is_available', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byCreator: index('items_creator_idx').on(t.creatorId) }),
);

export const judgementUnits = sqliteTable(
  'judgement_units',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    itemId: text('item_id'),
    mode: text('mode').notNull(),
    situation: text('situation').notNull(),
    verdict: text('verdict'),
    score: real('score'),
    ruleId: text('rule_id'),
    ruleText: text('rule_text').notNull(),
    caveat: text('caveat').notNull().default(''),
    note: text('note').notNull().default(''),
    voiceSample: text('voice_sample'),
    audioUrl: text('audio_url'),
    sourceRef: text('source_ref').notNull(),
    status: text('status').notNull().default('candidate'),
    priority: integer('priority').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byCreator: index('units_creator_idx').on(t.creatorId),
    byCreatorMode: index('units_creator_mode_idx').on(t.creatorId, t.mode, t.status),
  }),
);

export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    modeScope: text('mode_scope').notNull(),
    conditions: text('conditions').notNull(),
    effect: text('effect').notNull(),
    ruleText: text('rule_text').notNull(),
    weight: integer('weight').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byCreator: index('rules_creator_idx').on(t.creatorId) }),
);

export const templates = sqliteTable(
  'templates',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    mode: text('mode').notNull(),
    slots: text('slots').notNull(),
    text: text('text').notNull(),
    audioKey: text('audio_key').notNull(),
  },
  (t) => ({ byCreator: index('templates_creator_idx').on(t.creatorId, t.mode) }),
);

export const answers = sqliteTable(
  'answers',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    query: text('query').notNull(),
    unitIds: text('unit_ids').notNull(),
    itemIds: text('item_ids').notNull(),
    ruleIds: text('rule_ids').notNull(),
    renderedText: text('rendered_text').notNull(),
    skipNotes: text('skip_notes').notNull(),
    audioUrl: text('audio_url'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byCreator: index('answers_creator_idx').on(t.creatorId) }),
);

export const visitors = sqliteTable('visitors', {
  id: text('id').primaryKey(),
  firstSeen: text('first_seen').notNull(),
  lastSeen: text('last_seen').notNull(),
  context: text('context').notNull(),
});

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull(),
    creatorId: text('creator_id').notNull(),
    answerId: text('answer_id'),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    src: text('src'),
    ts: text('ts').notNull(),
  },
  (t) => ({
    byCreator: index('events_creator_idx').on(t.creatorId),
    byAnswer: index('events_answer_idx').on(t.answerId),
    byVisitor: index('events_visitor_idx').on(t.visitorId),
    byTypeTs: index('events_type_ts_idx').on(t.type, t.ts),
  }),
);

export const shares = sqliteTable(
  'shares',
  {
    id: text('id').primaryKey(),
    answerId: text('answer_id').notNull(),
    sharerVisitorId: text('sharer_visitor_id').notNull(),
    parentShareId: text('parent_share_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byAnswer: index('shares_answer_idx').on(t.answerId),
    byParent: index('shares_parent_idx').on(t.parentShareId),
  }),
);

export const candidates = sqliteTable(
  'candidates',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    sourceType: text('source_type').notNull(),
    rawText: text('raw_text').notNull(),
    proposedUnit: text('proposed_unit').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byCreator: index('candidates_creator_idx').on(t.creatorId, t.status) }),
);

export const saves = sqliteTable(
  'saves',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull(),
    answerId: text('answer_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byVisitor: index('saves_visitor_idx').on(t.visitorId),
    byAnswer: index('saves_answer_idx').on(t.answerId),
  }),
);

/** Case-file cohorts seeded from the briefs. Always rendered as labelled sample data. */
export const cohortRows = sqliteTable(
  'cohort_rows',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    label: text('label').notNull(),
    data: text('data').notNull(),
    sourceRef: text('source_ref').notNull(),
  },
  (t) => ({ byCreator: index('cohort_creator_idx').on(t.creatorId) }),
);

export const caseStats = sqliteTable(
  'case_stats',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    stat: text('stat').notNull(),
    value: text('value').notNull(),
    sourceRef: text('source_ref').notNull(),
  },
  (t) => ({ byCreator: index('case_stats_creator_idx').on(t.creatorId) }),
);

/** Open questions the creator must answer before a unit can be trusted. */
export const todos = sqliteTable(
  'todos',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    topic: text('topic').notNull(),
    detail: text('detail').notNull(),
    status: text('status').notNull().default('open'),
  },
  (t) => ({ byCreator: index('todos_creator_idx').on(t.creatorId) }),
);

/** Pre-generated speech + viseme tracks. Offline artefacts, never generated on the answer path. */
export const personaAssets = sqliteTable(
  'persona_assets',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    answerId: text('answer_id'),
    textHash: text('text_hash').notNull(),
    audioUrl: text('audio_url').notNull(),
    visemes: text('visemes').notNull(),
    durationSec: real('duration_sec').notNull(),
    source: text('source').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byCreator: index('persona_assets_creator_idx').on(t.creatorId) }),
);
