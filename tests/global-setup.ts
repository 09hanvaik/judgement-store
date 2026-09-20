import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tests run against their own database file, migrated and seeded from the same
 * scripts the app uses. Nothing here touches data/app.db.
 */
const TEST_DB = 'file:./data/test.db';

export default function setup() {
  const path = resolve('data/test.db');
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });

  const env = { ...process.env, DATABASE_URL: TEST_DB, DATABASE_AUTH_TOKEN: '' };
  const run = (script: string) =>
    execFileSync('npx', ['tsx', script], { env, stdio: 'pipe', shell: process.platform === 'win32' });

  run('scripts/migrate.ts');
  run('scripts/seed.ts');
}
