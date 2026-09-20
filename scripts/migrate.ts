import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { getClient, resolveDbUrl } from '../src/db/client';

config({ path: '.env.local', quiet: true });

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../src/db/migrations');

/** Split on semicolons at statement ends; our migrations contain no literals with ';'. */
function statements(sql: string): string[] {
  // Strip comments first: a ';' inside one would otherwise split a statement.
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const url = resolveDbUrl();
  if (url.startsWith('file:')) {
    mkdirSync(dirname(resolve(url.replace(/^file:/, ''))), { recursive: true });
  }
  const client = getClient();
  await client.execute(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    (await client.execute('SELECT name FROM _migrations')).rows.map((r) => String(r.name)),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const stmt of statements(sql)) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      args: [file, new Date().toISOString()],
    });
    console.log(`applied ${file}`);
    count += 1;
  }
  console.log(count === 0 ? `up to date (${url})` : `${count} migration(s) applied (${url})`);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
