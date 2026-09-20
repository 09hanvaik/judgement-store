import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { resolveDbUrl, getClient } from '../src/db/client';

config({ path: '.env.local', quiet: true });

const TABLES = [
  '_migrations',
  'todos',
  'case_stats',
  'cohort_rows',
  'saves',
  'candidates',
  'shares',
  'events',
  'visitors',
  'answers',
  'templates',
  'rules',
  'judgement_units',
  'items',
  'creators',
];

async function main() {
  const url = resolveDbUrl();
  if (url.startsWith('file:')) {
    const path = resolve(url.replace(/^file:/, ''));
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(path + suffix, { force: true });
    }
    console.log(`removed local database ${path}`);
    return;
  }
  // Remote database: drop tables rather than deleting a file.
  const client = getClient();
  for (const table of TABLES) {
    await client.execute(`DROP TABLE IF EXISTS ${table}`);
  }
  client.close();
  console.log(`dropped all tables on ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
