import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@libsql/client';

config({ path: '.env.local', quiet: true });

/**
 * Offline audio pre-generation. This never runs on the answer path: the demo
 * plays files that already exist, or falls back to the browser's own voice.
 *
 *   npm run generate-audio
 *
 * Without ELEVENLABS_API_KEY (or without a voice_id on a creator) it prints
 * what it would generate and exits cleanly, because consent to clone a voice
 * is the creator's to give, not this script's to assume.
 */

const OUT_DIR = resolve('public/audio');
const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();

function client() {
  const url = process.env.DATABASE_URL?.trim() || 'file:./data/app.db';
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
  return createClient(authToken ? { url, authToken } : { url });
}

async function generate(voiceId, text) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const db = client();

  const answers = await db.execute(
    `SELECT a.id, a.rendered_text, a.audio_url, c.slug, c.name, c.voice_id
       FROM answers a JOIN creators c ON c.id = a.creator_id
      ORDER BY a.id`,
  );

  if (answers.rows.length === 0) {
    console.log('No answers cached yet. Run the demo once, then run this script.');
    db.close();
    return;
  }

  let written = 0;
  let skipped = 0;
  let blocked = 0;

  for (const row of answers.rows) {
    const audioUrl = String(row.audio_url ?? '');
    const key = audioUrl.replace(/^\/audio\//, '').replace(/\.mp3$/, '');
    if (!key) continue;
    const path = resolve(OUT_DIR, `${key}.mp3`);

    if (existsSync(path)) {
      skipped += 1;
      continue;
    }
    if (!API_KEY || !row.voice_id) {
      blocked += 1;
      console.log(
        `  would generate ${key}.mp3 — ${!API_KEY ? 'no ELEVENLABS_API_KEY' : `no consented voice_id for ${row.name}`}`,
      );
      continue;
    }
    const audio = await generate(String(row.voice_id), String(row.rendered_text));
    writeFileSync(path, audio);
    written += 1;
    console.log(`  wrote ${key}.mp3`);
  }

  console.log(
    `\naudio: ${written} written, ${skipped} already present, ${blocked} skipped (no key or no consented voice).`,
  );
  if (blocked > 0) {
    console.log('The app still works: answers fall back to the browser voice, then to text.');
  }
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
