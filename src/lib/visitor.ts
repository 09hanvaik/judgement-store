'use client';

/**
 * Anonymous visitor identity. localStorage plus a cookie so a shared link
 * opened in the same browser still resolves to the same person. No accounts.
 */

const KEY = 'js.visitorId';
const FIRST_SEEN = 'js.firstSeen';

function makeId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `v_${random}`;
}

export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'v_server';
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = makeId();
    window.localStorage.setItem(KEY, id);
    window.localStorage.setItem(FIRST_SEEN, new Date().toISOString());
  }
  document.cookie = `${KEY}=${id}; path=/; max-age=31536000; samesite=lax`;
  return id;
}

export function getFirstSeen(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(FIRST_SEEN);
}

export function daysSinceFirstSeen(): number {
  const first = getFirstSeen();
  if (!first) return 0;
  return Number(((Date.now() - new Date(first).getTime()) / 86_400_000).toFixed(3));
}

/** Marks that this browser has been here before, for return detection. */
export function markVisit(slug: string): { isReturn: boolean; daysSince: number } {
  if (typeof window === 'undefined') return { isReturn: false, daysSince: 0 };
  const key = `js.visited.${slug}`;
  const previous = window.localStorage.getItem(key);
  window.localStorage.setItem(key, new Date().toISOString());
  if (!previous) return { isReturn: false, daysSince: 0 };
  return { isReturn: true, daysSince: daysSinceFirstSeen() };
}

export async function logEvent(input: {
  type: string;
  answerId?: string | null;
  creatorSlug?: string;
  payload?: Record<string, unknown>;
  src?: string | null;
}): Promise<void> {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, visitorId: getVisitorId() }),
    });
  } catch {
    // Events are telemetry: never let a failed log break the answer path.
  }
}
