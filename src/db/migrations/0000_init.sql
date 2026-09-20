-- Judgement store schema. Hand-written so `db:migrate` is deterministic and
-- runs identically against a local file and a remote libSQL/Turso database.

CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  handle_summary TEXT NOT NULL,
  followers_total INTEGER NOT NULL,
  dms_per_month INTEGER NOT NULL,
  reply_seconds_avg INTEGER,
  voice_id TEXT,
  portrait_url TEXT,
  accent TEXT NOT NULL DEFAULT '#12100E',
  disclosure_text TEXT NOT NULL,
  style_guide TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  price_gbp REAL,
  attrs TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_creator_idx ON items (creator_id);

CREATE TABLE IF NOT EXISTS judgement_units (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  item_id TEXT,
  mode TEXT NOT NULL,
  situation TEXT NOT NULL,
  verdict TEXT,
  score REAL,
  rule_id TEXT,
  rule_text TEXT NOT NULL,
  caveat TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  voice_sample TEXT,
  audio_url TEXT,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS units_creator_idx ON judgement_units (creator_id);
CREATE INDEX IF NOT EXISTS units_creator_mode_idx ON judgement_units (creator_id, mode, status);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  mode_scope TEXT NOT NULL,
  conditions TEXT NOT NULL,
  effect TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rules_creator_idx ON rules (creator_id);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  slots TEXT NOT NULL,
  text TEXT NOT NULL,
  audio_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS templates_creator_idx ON templates (creator_id, mode);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  query TEXT NOT NULL,
  unit_ids TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  rule_ids TEXT NOT NULL,
  rendered_text TEXT NOT NULL,
  skip_notes TEXT NOT NULL,
  audio_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_creator_idx ON answers (creator_id);

CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  context TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  answer_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  src TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_creator_idx ON events (creator_id);
CREATE INDEX IF NOT EXISTS events_answer_idx ON events (answer_id);
CREATE INDEX IF NOT EXISTS events_visitor_idx ON events (visitor_id);
CREATE INDEX IF NOT EXISTS events_type_ts_idx ON events (type, ts);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  answer_id TEXT NOT NULL,
  sharer_visitor_id TEXT NOT NULL,
  parent_share_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_answer_idx ON shares (answer_id);
CREATE INDEX IF NOT EXISTS shares_parent_idx ON shares (parent_share_id);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  proposed_unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS candidates_creator_idx ON candidates (creator_id, status);

CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS saves_visitor_idx ON saves (visitor_id);
CREATE INDEX IF NOT EXISTS saves_answer_idx ON saves (answer_id);
CREATE UNIQUE INDEX IF NOT EXISTS saves_visitor_answer_uq ON saves (visitor_id, answer_id);

CREATE TABLE IF NOT EXISTS cohort_rows (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  label TEXT NOT NULL,
  data TEXT NOT NULL,
  source_ref TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cohort_creator_idx ON cohort_rows (creator_id);

CREATE TABLE IF NOT EXISTS case_stats (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  stat TEXT NOT NULL,
  value TEXT NOT NULL,
  source_ref TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS case_stats_creator_idx ON case_stats (creator_id);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS todos_creator_idx ON todos (creator_id);
