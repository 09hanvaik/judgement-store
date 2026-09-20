'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shown only when a creator has no reply-time figure in her brief. Until she
 * gives one, the time-back estimate stays blank rather than guessing.
 */
export function ReplyTimeInput({ slug, dmsPerMonth }: { slug: string; dmsPerMonth: number }) {
  const router = useRouter();
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = Number(hours);
  const seconds =
    Number.isFinite(parsed) && parsed > 0 && dmsPerMonth > 0
      ? Math.round((parsed * 3600) / dmsPerMonth)
      : null;

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!seconds) return;
        setSaving(true);
        await fetch(`/api/creators/${slug}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ replySecondsAvg: seconds }),
        });
        setSaving(false);
        router.refresh();
      }}
    >
      <label className="text-sm">
        <span className="label block">Hours a month she spends replying</span>
        <input
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          inputMode="decimal"
          placeholder="e.g. 40"
          className="mt-1 w-32 rounded-full border border-line bg-white px-3 py-1.5 outline-none focus:border-ink"
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!seconds || saving}>
        {saving ? 'Saving…' : 'Set'}
      </button>
      {seconds ? (
        <p className="w-full text-sm text-muted">
          {hours} hours ÷ {dmsPerMonth.toLocaleString()} DMs = {seconds} seconds per reply.
        </p>
      ) : null}
    </form>
  );
}
