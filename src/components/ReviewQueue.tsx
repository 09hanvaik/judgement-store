'use client';

import { useCallback, useEffect, useState } from 'react';

interface ProposedUnit {
  mode: string;
  item_name: string | null;
  item_id: string | null;
  verdict: string | null;
  score: number | null;
  rule_text: string;
  note: string;
  caveat: string;
  voice_sample: string;
  todo?: string | null;
}

interface Candidate {
  id: string;
  sourceType: string;
  rawText: string;
  status: string;
  createdAt: string;
  proposedUnit: ProposedUnit;
}

interface CandidateUnit {
  id: string;
  mode: string;
  itemId: string | null;
  verdict: string | null;
  ruleText: string;
  caveat: string;
  note: string;
  sourceRef: string;
}

export function ReviewQueue({ slug, creatorName }: { slug: string; creatorName: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [units, setUnits] = useState<CandidateUnit[]>([]);
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/creators/${slug}/candidates`);
    const data = (await response.json()) as { candidates: Candidate[]; candidateUnits: CandidateUnit[] };
    setCandidates(data.candidates ?? []);
    setUnits(data.candidateUnits ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runExtract() {
    if (!transcript.trim()) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/ingest/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, rawText: transcript, sourceType: 'voice_note' }),
    });
    const data = (await response.json()) as { created?: number; extractor?: string; error?: string };
    setBusy(false);
    setMessage(
      data.error
        ? `Could not extract: ${data.error}`
        : `${data.created} candidate${data.created === 1 ? '' : 's'} from the ${data.extractor} extractor. None are live until approved.`,
    );
    setTranscript('');
    await load();
  }

  async function act(id: string, action: 'approve' | 'edit' | 'reject', edits?: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/units/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, edits }),
    });
    setBusy(false);
    await load();
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold">Paste a voice note</h2>
        <p className="mb-3 text-sm text-muted">
          Transcript text, a notebook page, anything {creatorName.split(' ')[0]} actually said. Audio
          upload posts to the same pipeline when a transcription key is configured.
        </p>
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={5}
          placeholder="e.g. The glass drop is good but I would not pay £62 for it. The cloud cream is worth it, I would buy it again."
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-ink"
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={runExtract} disabled={busy || !transcript.trim()}>
            {busy ? 'Working…' : 'Extract candidates'}
          </button>
          {message ? <p className="text-sm text-muted">{message}</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">From transcripts</h2>
        <p className="mb-3 text-sm text-muted">
          {candidates.length === 0 ? 'Nothing waiting.' : `${candidates.length} waiting.`}
        </p>
        <ul className="space-y-3">
          {candidates.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} busy={busy} onAct={act} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">From her notes, still unanswered</h2>
        <p className="mb-3 text-sm text-muted">
          Seeded straight from the case file where a note exists but a verdict does not. These never
          appear in answers.
        </p>
        <ul className="space-y-3">
          {units.length === 0 ? <li className="text-sm text-muted">Nothing waiting.</li> : null}
          {units.map((unit) => (
            <li key={unit.id} className="card px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="label">{unit.mode}</span>
                <span className="font-medium">{unit.itemId ?? 'no item'}</span>
              </div>
              <p className="mt-1 text-sm">{unit.ruleText}</p>
              {unit.caveat ? <p className="mt-1 text-sm text-muted">{unit.caveat}</p> : null}
              <p className="label mt-2">Source: {unit.sourceRef}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(unit.id, 'approve')}>
                  Approve
                </button>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => act(unit.id, 'reject')}>
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  onAct,
}: {
  candidate: Candidate;
  busy: boolean;
  onAct: (id: string, action: 'approve' | 'edit' | 'reject', edits?: Record<string, unknown>) => void;
}) {
  const unit = candidate.proposedUnit;
  const [editing, setEditing] = useState(false);
  const [ruleText, setRuleText] = useState(unit.rule_text);
  const [verdict, setVerdict] = useState(unit.verdict ?? '');
  const [note, setNote] = useState(unit.note);

  return (
    <li className="card px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="label">{unit.mode}</span>
        {unit.item_name ? <span className="font-medium">{unit.item_name}</span> : null}
        {unit.verdict ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs">{unit.verdict}</span>
        ) : null}
        <span className="label">{candidate.sourceType}</span>
      </div>

      <blockquote className="mt-2 border-l-2 pl-3 text-sm italic" style={{ borderColor: 'var(--accent)' }}>
        &ldquo;{unit.voice_sample}&rdquo;
      </blockquote>

      {editing ? (
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            <span className="label">Rule text</span>
            <input
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Note</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Verdict</span>
            <select
              value={verdict}
              onChange={(event) => setVerdict(event.target.value)}
              className="mt-1 rounded-xl border border-line px-3 py-2 outline-none focus:border-ink"
            >
              <option value="">none</option>
              <option value="buy">buy</option>
              <option value="maybe">maybe</option>
              <option value="no">no</option>
              <option value="pick">pick</option>
              <option value="skip">skip</option>
            </select>
          </label>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm">{unit.rule_text}</p>
          {unit.todo ? (
            <p className="mt-1 text-sm" style={{ color: 'var(--accent)' }}>
              {unit.todo}
            </p>
          ) : null}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {editing ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              onAct(candidate.id, 'edit', {
                ruleText,
                note,
                verdict: verdict === '' ? null : verdict,
              })
            }
          >
            Save and approve
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onAct(candidate.id, 'approve')}>
              Approve
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onAct(candidate.id, 'reject')}>
          Reject
        </button>
      </div>
    </li>
  );
}
