'use client';

import Link from 'next/link';
import type { ChannelDraft } from '@/lib/lab/types';

/**
 * Channel draft card — Liquid Glass refresh 2026-05-27.
 *
 * Card de un borrador de canal. Glass surface + magenta sutil para el accent
 * (es contenido de Lab). Progress bar de 5 segmentos coherente con el
 * sistema, y status pill con la familia .pill-*.
 */

const STATUS_PILL: Record<ChannelDraft['status'], string> = {
  draft: 'pill-soon',
  validated:
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-amber-300 bg-amber-500/14 border border-amber-500/40',
  bootstrapped: 'pill-active',
  'in-production':
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-sky-300 bg-sky-500/14 border border-sky-500/40',
  // 'archived' antes idéntico a 'draft' (pill-soon). Tratamiento distinto: zinc
  // sólido + borde discontinuo (la card además baja de opacidad, ver abajo).
  archived:
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 bg-zinc-500/10 border border-dashed border-zinc-500/40',
};

const STATUS_LABEL: Record<ChannelDraft['status'], string> = {
  draft: 'borrador',
  validated: 'validado',
  bootstrapped: 'bootstrap ok',
  'in-production': 'en producción',
  archived: 'archivado',
};

export function ChannelDraftCard({ draft }: { draft: ChannelDraft }) {
  const displayName =
    draft.bootstrap?.chosenName ||
    draft.referenceChannelName ||
    draft.referenceChannelUrl;
  const wizardHref = `/lab/drafts/${draft.id}`;
  const showActiveAccent =
    draft.status === 'validated' || draft.status === 'bootstrapped';
  const isArchived = draft.status === 'archived';

  return (
    <Link
      href={wizardHref}
      className={`glass glass-hover block rounded-[28px] p-5 ${isArchived ? 'opacity-60 hover:opacity-100' : ''}`}
      style={
        showActiveAccent
          ? { borderColor: 'rgba(217,70,239,0.30)' }
          : undefined
      }
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate font-display text-lg font-semibold tracking-display text-white">
          {displayName}
        </h3>
        <span className={`${STATUS_PILL[draft.status]} shrink-0`}>
          {draft.status === 'bootstrapped' && (
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400" />
          )}
          {STATUS_LABEL[draft.status]}
        </span>
      </div>

      <p
        className="mb-4 truncate font-mono text-[11px] text-zinc-500"
        title={draft.referenceChannelUrl}
      >
        ref: {draft.referenceChannelUrl}
      </p>

      {/* Progress de 5 segmentos. `n < currentStep` = hecho (magenta de Lab,
          coherente con WizardProgress); `n === currentStep` = actual; resto vacío. */}
      <div className="mb-3 flex gap-1">
        {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
          const isDone = n < draft.currentStep;
          const isCurrent = n === draft.currentStep;
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

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">
          paso{' '}
          <span className="nums font-medium text-zinc-300">
            {draft.currentStep}
          </span>
          <span className="text-zinc-600"> / 5</span>
        </span>
        <span className="nums font-mono text-[10px] text-zinc-600">
          {new Date(draft.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
