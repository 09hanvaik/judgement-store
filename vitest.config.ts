import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // The suite shares one SQLite file, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    globalSetup: ['tests/global-setup.ts'],
    env: {
      DATABASE_URL: 'file:./data/test.db',
      DATABASE_AUTH_TOKEN: '',
      // Guarantees the ingestion tests exercise the offline heuristic extractor.
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
