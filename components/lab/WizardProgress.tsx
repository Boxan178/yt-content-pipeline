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

/**
 * Wizard progress indicator — Liquid Glass refresh 2026-05-27.
 *
 * Línea horizontal con 5 segmentos. Segmentos completados van en magenta
 * (Lab accent), segmentos vacíos en .seg-empty. El step actual lleva un
 * dot magenta animado a la izquierda de la etiqueta.
 */
export function WizardProgress({
  current,
  total = 5,
  labels = DEFAULT_LABELS,
}: WizardProgressProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      {/* Segmentos */}
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const isDone = n < current;
          const isCurrent = n === current;
          return (
            <div
              key={n}
              className="h-1.5 flex-1 rounded-full"
              style={
                isDone
                  ? {
                      background:
                        'linear-gradient(180deg, rgba(217,70,239,0.85), rgba(217,70,239,0.55))',
                      boxShadow:
                        '0 0 6px rgba(217,70,239,0.4), inset 0 1px 0 0 rgba(255,255,255,0.18)',
                    }
                  : isCurrent
                  ? {
                      background:
                        'linear-gradient(180deg, rgba(217,70,239,0.55), rgba(217,70,239,0.25))',
                      boxShadow: '0 0 12px -2px rgba(217,70,239,0.5)',
                    }
                  : { background: 'rgba(255, 255, 255, 0.06)' }
              }
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const isDone = n < current;
          const isCurrent = n === current;
          return (
            <div key={n} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                  isCurrent
                    ? 'border border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200'
                    : isDone
                    ? 'border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
                    : 'border border-white/10 bg-white/[0.03] text-zinc-600'
                }`}
                style={
                  isCurrent
                    ? { boxShadow: '0 0 12px -2px rgba(217,70,239,0.5)' }
                    : undefined
                }
              >
                {isDone ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <span className="nums">{n}</span>
                )}
              </span>
              <span
                className={`text-[10px] font-medium uppercase tracking-label ${
                  isCurrent
                    ? 'text-fuchsia-200'
                    : isDone
                    ? 'text-fuchsia-300/70'
                    : 'text-zinc-600'
                }`}
              >
                {labels[n - 1]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
