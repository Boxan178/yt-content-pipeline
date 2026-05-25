'use client';

import Link from 'next/link';
import type { ChannelDraft } from '@/lib/lab/types';

const STATUS_BADGE: Record<ChannelDraft['status'], string> = {
  draft: 'bg-zinc-700/30 text-zinc-300 border-zinc-600/40',
  validated: 'bg-amber-700/20 text-amber-300 border-amber-600/40',
  bootstrapped: 'bg-emerald-700/20 text-emerald-300 border-emerald-600/40',
  'in-production': 'bg-sky-700/20 text-sky-300 border-sky-600/40',
  archived: 'bg-zinc-900/40 text-zinc-500 border-zinc-700/40',
};

const STATUS_LABEL: Record<ChannelDraft['status'], string> = {
  draft: 'Borrador',
  validated: 'Validado',
  bootstrapped: 'Bootstrap OK',
  'in-production': 'En producción',
  archived: 'Archivado',
};

export function ChannelDraftCard({ draft }: { draft: ChannelDraft }) {
  const displayName = draft.bootstrap?.chosenName || draft.referenceChannelName || draft.referenceChannelUrl;
  const wizardHref = `/lab/drafts/${draft.id}`;

  return (
    <Link
      href={wizardHref}
      className="block rounded-lg border border-border bg-panel p-4 transition hover:border-accent/60 hover:bg-panel/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">{displayName}</h3>
          <p className="mt-1 truncate text-xs text-zinc-400">
            Ref: {draft.referenceChannelUrl}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE[draft.status]}`}
        >
          {STATUS_LABEL[draft.status]}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Paso {draft.currentStep}/5</span>
        <span>{new Date(draft.updatedAt).toLocaleDateString()}</span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${(draft.currentStep / 5) * 100}%` }}
        />
      </div>
    </Link>
  );
}
