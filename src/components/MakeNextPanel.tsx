interface Post {
  title: string;
  views: number;
  signups: number;
}

/**
 * Aditi is the only case with two customers. This is the creator-side decision:
 * what to make next, ranked only by evidence that exists in her case file.
 */
export function MakeNextPanel({
  data,
  accent,
}: {
  data: { label: string; note: string; posts: Post[] };
  accent: string;
}) {
  const ranked = [...data.posts]
    .map((post) => ({
      ...post,
      perHundredK: post.views > 0 ? Number(((post.signups / post.views) * 100_000).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.perHundredK - a.perHundredK || a.title.localeCompare(b.title));

  const best = ranked[0];
  const loudest = [...data.posts].sort((a, b) => b.views - a.views)[0];

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold">What to make next</h2>
      <p className="mb-3 text-sm text-muted">{data.label}</p>

      <div className="card mb-3 px-4 py-3">
        <p className="text-sm">
          Highest yield: <strong>{best.title}</strong> at {best.perHundredK} sign-ups per 100K views.
          Biggest audience: <strong>{loudest.title}</strong> at {loudest.views.toLocaleString()} views.
          Ranking by reach and ranking by result do not give the same answer.
        </p>
        <p className="mt-2 text-xs text-muted">{data.note}</p>
      </div>

      <ul className="space-y-2">
        {ranked.map((post) => {
          const width = best.perHundredK > 0 ? (post.perHundredK / best.perHundredK) * 100 : 0;
          return (
            <li key={post.title} className="rounded-xl border border-line px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{post.title}</span>
                <span className="text-sm text-muted">
                  {post.views.toLocaleString()} views · {post.signups.toLocaleString()} sign-ups
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-paper">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${Math.max(width, 1.5)}%`, background: accent }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {post.perHundredK} sign-ups per 100K views — computed from case-file numbers
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
