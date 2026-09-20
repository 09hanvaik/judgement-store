import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@libsql/client';

config({ path: '.env.local', quiet: true });

/**
 * Offline persona pre-generation.
 *
 * Speech and viseme timings for every cached answer, written to public/persona
 * and recorded in persona_assets. Run it once before a demo and the persona
 * speaks with zero external calls while anyone is watching.
 *
 *   npm run generate-persona
 *   npm run generate-persona -- --creator maya
 *
 * Without a provider it prints what it would generate and exits cleanly: the
 * app still works, falling back to the browser's own voice.
 */

const OUT_DIR = resolve('public/persona');
const DAYTONA_URL = process.env.DAYTONA_API_URL?.trim();
const DAYTONA_KEY = process.env.DAYTONA_API_KEY?.trim();
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY?.trim();

const args = process.argv.slice(2);
const onlyCreator = args.includes('--creator') ? args[args.indexOf('--creator') + 1] : null;

function client() {
  const url = process.env.DATABASE_URL?.trim() || 'file:./data/app.db';
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
  return createClient(authToken ? { url, authToken } : { url });
}

/** Mirrors src/persona/visemes.ts. Kept in step by tests/persona.test.ts. */
const LETTER_VISEME = {
  a: 'viseme_aa', e: 'viseme_E', i: 'viseme_I', o: 'viseme_O', u: 'viseme_U', y: 'viseme_I', w: 'viseme_U',
  p: 'viseme_PP', b: 'viseme_PP', m: 'viseme_PP', f: 'viseme_FF', v: 'viseme_FF',
  t: 'viseme_DD', d: 'viseme_DD', k: 'viseme_kk', g: 'viseme_kk', c: 'viseme_kk', q: 'viseme_kk', x: 'viseme_kk',
  s: 'viseme_SS', z: 'viseme_SS', n: 'viseme_nn', l: 'viseme_nn', r: 'viseme_RR', j: 'viseme_CH', h: 'viseme_sil',
};
const VOWELS = new Set(['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U']);

function digraph(prev, ch) {
  if (prev === 't' && ch === 'h') return 'viseme_TH';
  if ((prev === 'c' || prev === 's') && ch === 'h') return 'viseme_CH';
  return null;
}

function alignmentToVisemes(alignment) {
  const frames = [];
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];
  let previous = '';
  let last = null;

  for (let i = 0; i < chars.length; i += 1) {
    const raw = (chars[i] ?? '').toLowerCase();
    const start = starts[i] ?? 0;
    if (!/[a-zà-ÿ]/.test(raw)) {
      if (last !== 'viseme_sil') {
        frames.push({ t: +start.toFixed(4), v: 'viseme_sil', w: 0 });
        last = 'viseme_sil';
      }
      previous = '';
      continue;
    }
    const pair = digraph(previous, raw);
    const viseme = pair ?? LETTER_VISEME[raw] ?? 'viseme_nn';
    if (pair && frames.length > 0) frames.pop();
    const weight = VOWELS.has(viseme) ? 0.85 : 0.55;
    if (viseme !== last || VOWELS.has(viseme)) {
      frames.push({ t: +start.toFixed(4), v: viseme, w: weight });
      last = viseme;
    }
    previous = raw;
  }
  frames.push({ t: +(ends[ends.length - 1] ?? 0).toFixed(4), v: 'viseme_sil', w: 0 });
  return frames;
}

async function synthesise(text, voiceId) {
  if (DAYTONA_URL) {
    const response = await fetch(`${DAYTONA_URL.replace(/\/$/, '')}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DAYTONA_KEY ?? ''}` },
      body: JSON.stringify({ text, voice_id: voiceId }),
    });
    if (!response.ok) throw new Error(`daytona ${response.status}: ${await response.text()}`);
    return response.json();
  }
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    {
      method: 'POST',
      headers: { 'xi-api-key': ELEVEN_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15 },
      }),
    },
  );
  if (!response.ok) throw new Error(`elevenlabs ${response.status}: ${await response.text()}`);
  return response.json();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const db = client();

  const rows = (
    await db.execute(
      `SELECT a.id, a.rendered_text, c.id AS creator_id, c.slug, c.name, c.voice_id
         FROM answers a JOIN creators c ON c.id = a.creator_id
        ORDER BY a.id`,
    )
  ).rows.filter((row) => !onlyCreator || row.slug === onlyCreator);

  if (rows.length === 0) {
    console.log('No cached answers yet. Run the demo once, then run this script.');
    db.close();
    return;
  }

  const available = Boolean(DAYTONA_URL || ELEVEN_KEY);
  let written = 0;
  let skipped = 0;
  let blocked = 0;

  for (const row of rows) {
    const text = String(row.rendered_text);
    const creatorId = String(row.creator_id);
    const textHash = createHash('sha256').update(`${creatorId}|${text}`).digest('hex').slice(0, 16);

    const existing = await db.execute({
      sql: 'SELECT id FROM persona_assets WHERE creator_id = ? AND text_hash = ?',
      args: [creatorId, textHash],
    });
    if (existing.rows.length > 0) {
      skipped += 1;
      continue;
    }

    if (!available || !row.voice_id) {
      blocked += 1;
      console.log(
        `  would generate ${row.slug}/${row.id} — ${
          !available ? 'no ELEVENLABS_API_KEY or DAYTONA_API_URL' : `no consented voice_id for ${row.name}`
        }`,
      );
      continue;
    }

    const result = await synthesise(text, String(row.voice_id));
    const frames = alignmentToVisemes(result.alignment);
    const duration = +(result.alignment.character_end_times_seconds.at(-1) ?? 0).toFixed(3);

    const file = `${row.slug}-${row.id}`;
    writeFileSync(resolve(OUT_DIR, `${file}.mp3`), Buffer.from(result.audio_base64, 'base64'));
    writeFileSync(resolve(OUT_DIR, `${file}.visemes.json`), JSON.stringify({ frames, duration }, null, 0));

    await db.execute({
      sql: `INSERT INTO persona_assets
              (id, creator_id, answer_id, text_hash, audio_url, visemes, duration_sec, source, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        `pa_${textHash}`,
        creatorId,
        String(row.id),
        textHash,
        `/persona/${file}.mp3`,
        JSON.stringify(frames),
        duration,
        'elevenlabs',
        new Date().toISOString(),
      ],
    });

    written += 1;
    console.log(`  wrote ${file}.mp3 (${duration}s, ${frames.length} visemes)`);
  }

  console.log(
    `\npersona: ${written} generated, ${skipped} already cached, ${blocked} skipped (no key or no consented voice).`,
  );
  if (blocked > 0) {
    console.log('The app still works: those lines fall back to the browser voice and an estimated mouth.');
  }
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
