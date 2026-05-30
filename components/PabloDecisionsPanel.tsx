'use client';

import { useState } from 'react';
import type { PabloDecision } from '@/lib/parse-pablo-decisions';
import { DecisionModal } from './DecisionModal';

interface Props {
  decisions: PabloDecision[];
  /** Path absoluto de la carpeta del vídeo. */
  videoFolder: string;
  /** Miniaturas disponibles (para decisiones de tipo thumbnail_pick). */
  thumbnailOptions?: Array<{ name: string; url: string }>;
  onResolved?: () => void;
}

export function PabloDecisionsPanel({ decisions, videoFolder, thumbnailOptions, onResolved }: Props) {
  const [open, setOpen] = useState<PabloDecision | null>(null);
  if (decisions.length === 0) return null;

  return (
    <section className="glass rounded-3xl p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Decisiones de Pablo
        </h3>
        <span className="nums rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
          {decisions.length} pendientes
        </span>
      </header>

      <ul className="space-y-1.5">
        {decisions.map((d) => (
          <li
            key={`${d.section}:${d.anchor}`}
            className="group flex items-start gap-2.5 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-zinc-200 transition hover:bg-yellow-500/10"
          >
            <span className="mt-0.5 shrink-0 text-yellow-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>
            <div className="flex-1 leading-snug">
              <p className="font-medium text-zinc-100">{d.label}</p>
              <p className="text-[10px] text-zinc-500">{d.section}</p>
              {d.recommendation && (
                <p className="mt-0.5 text-[10px] text-zinc-400">★ {d.recommendation}</p>
              )}
            </div>
            <button
              onClick={() => setOpen(d)}
              className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-accent transition hover:bg-accent/20"
            >
              decidir →
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <DecisionModal
          itemText={`${open.label} — ${open.section}`}
          videoFolder={videoFolder}
          thumbnailOptions={thumbnailOptions}
          presetKind={open.kind}
          presetOptions={open.options}
          presetQuestion={open.label}
          presetRecommendation={open.recommendation}
          statusAnchor={open.anchor}
          onClose={() => setOpen(null)}
          onResolved={() => {
            setOpen(null);
            onResolved?.();
          }}
        />
      )}
    </section>
  );
}
