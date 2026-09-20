import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * One client for both worlds: a local file (default) and a remote Turso/libSQL
 * URL. Nothing else in the app knows which one is in play.
 */

export function resolveDbUrl(): string {
  return process.env.DATABASE_URL?.trim() || 'file:./data/app.db';
}

type Bundle = { client: Client; db: ReturnType<typeof drizzle> };

let cached: Bundle | null = null;

function init(): Bundle {
  if (!cached) {
    const url = resolveDbUrl();
    const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
    const client = createClient(authToken ? { url, authToken } : { url });
    cached = { client, db: drizzle(client, { schema }) };
  }
  return cached;
}

export const getDb = (): ReturnType<typeof drizzle> => init().db;
export const getClient = (): Client => init().client;

function proxy<T extends object>(pick: () => object): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = pick() as Record<string | symbol, unknown>;
      const value = target[prop];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** Lazily-bound singletons so importing this module never opens a connection. */
export const db = proxy<ReturnType<typeof drizzle>>(() => init().db);
export const sqlClient = proxy<Client>(() => init().client);

export { schema };
