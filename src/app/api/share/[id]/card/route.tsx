import { ImageResponse } from 'next/og';
import { loadAnswer } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The card a forward actually lands as. It carries the pick, the verdict, the
 * rule that fired and the disclosure — the same four things the page shows.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const answer = await loadAnswer(id);

  if (!answer) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FBF9F6',
            fontSize: 40,
            color: '#6B6560',
          }}
        >
          Answer not found
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const pick = answer.picks[0];
  const accent = answer.creator.accent;
  const rule = answer.firedRules[0]?.text ?? pick?.ruleText ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#FBF9F6',
          padding: 64,
          fontFamily: 'sans-serif',
          color: '#12100E',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                borderRadius: 26,
                border: `2px solid ${accent}`,
                color: accent,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {answer.creator.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div style={{ fontSize: 28, color: '#6B6560' }}>{`${answer.creator.name} would say`}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 8 }}>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -1 }}>
              {pick?.itemName ?? 'Her call'}
            </div>
            {pick?.priceGbp != null ? (
              <div style={{ fontSize: 40, color: '#6B6560' }}>{`£${pick.priceGbp}`}</div>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            {pick?.score != null ? (
              <div
                style={{
                  display: 'flex',
                  background: accent,
                  color: '#fff',
                  fontSize: 26,
                  padding: '6px 16px',
                  borderRadius: 999,
                }}
              >
                {`${pick.score.toFixed(1)}/10`}
              </div>
            ) : null}
            {pick?.verdict ? (
              <div
                style={{
                  display: 'flex',
                  border: '2px solid #E7E1D9',
                  fontSize: 26,
                  padding: '6px 16px',
                  borderRadius: 999,
                }}
              >
                {pick.verdict}
              </div>
            ) : null}
          </div>

          {pick?.note ? (
            <div style={{ fontSize: 32, color: '#12100E', marginTop: 14 }}>{pick.note}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 18, letterSpacing: 2, color: '#6B6560' }}>THE RULE THAT FIRED</div>
            <div style={{ fontSize: 26, color: '#12100E' }}>{rule.slice(0, 150)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                background: accent,
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 999,
              }}
            >
              AI
            </div>
            <div style={{ fontSize: 20, color: '#6B6560' }}>{answer.creator.disclosureText}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
