'use client';

import type { WizardStep } from '@/lib/lab/types';

interface WizardProgressProps {
  current: WizardStep;
  total?: number;
  labels?: string[];
}

const DEFAULT_LABELS = [
  'Referencia',
  'Análisis',
  'Visual',
  'Validación',
  'Bootstrap',
];

export function WizardProgress({
  current,
  total = 5,
  labels = DEFAULT_LABELS,
}: WizardProgressProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const isDone = n < current;
        const isCurrent = n === current;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                isDone
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : isCurrent
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-border bg-panel text-zinc-500'
              }`}
            >
              {isDone ? '✓' : n}
            </div>
            <span
              className={`text-xs ${
                isCurrent
                  ? 'font-semibold text-accent'
                  : isDone
                  ? 'text-emerald-400'
                  : 'text-zinc-500'
              }`}
            >
              {labels[n - 1]}
            </span>
            {n < total && <span className="text-zinc-700">→</span>}
          </div>
        );
      })}
    </div>
  );
}
