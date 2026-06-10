'use client';

import { useState } from 'react';
import type { Idea } from '@/lib/lab/types';

interface Props {
  idea: Idea;
  channelSlug: string;
  /** Si false, "Iniciar pipeline" sale deshabilitado con tooltip. */
  autoPipeline: boolean;
  /** Se llama tras iniciar pipeline o borrar para refrescar el kanban. */
  onChanged?: () => void;
  /** Toast handler. */
  onToast?: (msg: string) => void;
}

export function IdeaCard({ idea, channelSlug, autoPipeline, onChanged, onToast }: Props) {
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const startPipeline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!autoPipeline) return;
    if (!confirm(`Iniciar pipeline para "${idea.title}"?\n\nSe crea la carpeta del vídeo y SARA lo produce de cero hasta "listo para subir" (~20-30 min). No se publica en YouTube.`)) {
      return;
    }
    setStarting(true);
    try {
      const r = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/ideas/${encodeURIComponent(idea.id)}/start-pipeline`,
        { method: 'POST' },
      );
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      onToast?.(`Pipeline iniciado: "${idea.title}" — SARA trabajando`);
      onChanged?.();
    } catch (err) {
      onToast?.(`Error al iniciar pipeline: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStarting(false);
    }
  };

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la idea "${idea.title}"?`)) return;
    setDeleting(true);
    try {
      const r = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/ideas/${encodeURIComponent(idea.id)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      onToast?.(`Idea eliminada: "${idea.title}"`);
      onChanged?.();
    } catch (err) {
      onToast?.(`Error al eliminar: ${err instanceof Error ? err.message : String(err)}`);
      setDeleting(false);
    }
  };

  return (
    <article className="group relative shrink-0 overflow-hidden rounded-lg border border-border bg-bg/60 p-3 transition hover:border-fuchsia-500/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-fuchsia-300">
              idea
            </span>
            <PriorityPill priority={idea.priority} />
          </div>
          <h3 className="line-clamp-2 text-sm font-medium leading-tight text-white" title={idea.title}>
            {idea.title}
          </h3>
        </div>
        <button
          onClick={remove}
          disabled={deleting}
          title="Eliminar idea"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500 transition hover:border-red-500/30 hover:text-red-400 disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-zinc-400">
        {idea.description}
      </p>

      {idea.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {idea.tags.map((t) => (
            <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">
              {t}
            </span>
          ))}
        </div>
      )}

      {idea.sourceVideoTitle && (
        <p className="mt-2 truncate text-[10px] text-zinc-500" title={idea.sourceVideoTitle}>
          ↗ patrón de mercado: {idea.sourceVideoUrl ? (
            <a
              href={idea.sourceVideoUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-fuchsia-300 hover:underline"
            >
              {idea.sourceVideoTitle}
            </a>
          ) : (
            idea.sourceVideoTitle
          )}
        </p>
      )}

      <button
        onClick={startPipeline}
        disabled={starting || !autoPipeline}
        title={autoPipeline ? 'Crea la carpeta del vídeo y lanza a SARA hasta listo para subir' : 'El pipeline automático solo está disponible en Moderni Stoici por ahora'}
        className={`mt-3 w-full rounded-md px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
          autoPipeline
            ? 'border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
            : 'border border-border bg-bg text-zinc-500'
        }`}
      >
        {starting ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Iniciando…
          </span>
        ) : autoPipeline ? (
          '▶ Iniciar pipeline'
        ) : (
          '🔒 Pipeline (solo Moderni Stoici)'
        )}
      </button>
    </article>
  );
}

function PriorityPill({ priority }: { priority: 1 | 2 | 3 | 4 | 5 }) {
  const cls =
    priority >= 4
      ? 'border-fuchsia-500/40 bg-fuchsia-500/14 text-fuchsia-300'
      : priority === 3
      ? 'border-white/10 bg-white/[0.04] text-zinc-300'
      : 'border-white/10 bg-white/[0.04] text-zinc-500';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      P{priority}
    </span>
  );
}
