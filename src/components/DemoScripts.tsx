'use client';

import type { DemoScript, DemoStep } from '@/lib/casefile';

/**
 * Two scripts, side by side: one where her notes cover the question, one where
 * they do not. The second is the one worth watching — a decline should still
 * sound like her, and should still show the rule it came from.
 */
export function DemoScripts({
  scripts,
  accent,
  activeStep,
  disabled,
  onRun,
  variant = 'light',
}: {
  scripts: DemoScript[];
  accent: string;
  activeStep: string | null;
  disabled: boolean;
  onRun: (step: DemoStep, key: string) => void;
  variant?: 'light' | 'glass';
}) {
  if (scripts.length === 0) return null;

  const shell = variant === 'glass' ? 'glass demo-script' : 'rounded-xl border border-dashed border-line px-4 py-3';
  const chip = variant === 'glass' ? 'glass chipx' : 'chip';

  return (
    <div className={variant === 'glass' ? 'demo-scripts' : 'space-y-3'}>
      {scripts.map((script) => (
        <section key={script.name} className={shell}>
          <p className={variant === 'glass' ? 'demo-title' : 'label'}>
            {script.name} — {script.archetype}
          </p>
          <p
            className={
              variant === 'glass' ? 'demo-blurb' : 'mt-1 text-sm text-muted'
            }
          >
            {script.blurb}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {script.steps.map((step, index) => {
              const key = `${script.name}:${index}`;
              return (
                <button
                  key={key}
                  type="button"
                  className={chip}
                  data-active={activeStep === key}
                  disabled={disabled}
                  style={activeStep === key && variant === 'light' ? { borderColor: accent } : undefined}
                  onClick={() => onRun(step, key)}
                >
                  {index + 1}. {step.label}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
