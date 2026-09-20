-- The 3D persona. A creator opts in by generating one from a photo. Until then
-- persona_url is null and every surface falls back to the stand-in presence.
ALTER TABLE creators ADD COLUMN persona_url TEXT;

-- Pre-generated speech and viseme tracks, keyed by the answer they belong to.
-- Cached offline so the demo path makes no external call.
CREATE TABLE IF NOT EXISTS persona_assets (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  answer_id TEXT,
  text_hash TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  visemes TEXT NOT NULL,
  duration_sec REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS persona_assets_creator_idx ON persona_assets (creator_id);
CREATE UNIQUE INDEX IF NOT EXISTS persona_assets_hash_uq ON persona_assets (creator_id, text_hash);
