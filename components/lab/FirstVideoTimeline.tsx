'use client';

import { useState } from 'react';
import type { ChannelDraft } from '@/lib/lab/types';

interface Phase {
  index: number;
  title: string;
  skills: string;
  blurb: string;
}

const PHASES: Phase[] = [
  {
    index: 1,
    title: 'Packaging',
    skills: 'MARIO · MARCOS · NORA+IRIS',
    blurb: 'Validación de topic, 4 propuestas de título, concepto de miniatura.',
  },
  {
    index: 2,
    title: 'Creación (guion)',
    skills: 'MARCO AURELIO o VÍCTOR · ELENA',
    blurb: 'Guion completo style-locked + auditoría dura.',
  },
  {
    index: 3,
    title: 'Visual (image + video prompts)',
    skills: 'IRIS · CIRO',
    blurb: 'Prompts por beat (image) + clips animados (video).',
  },
  {
    index: 4,
    title: 'Audio (locución)',
    skills: 'CICERÓN · CALIOPE',
    blurb: 'Director SSML + ejecución TTS real (MP3s).',
  },
  {
    index: 5,
    title: 'Edición',
    skills: 'LUÍS',
    blurb: 'auto-edit + audit visual + AMELIA + MARCUS HALE.',
  },
  {
    index: 6,
    title: 'Pre-publicación + upload',
    skills: 'youtube-seo-optimizer · chapters · youtube-uploader',
    blurb: 'Descripción SEO, chapters verificados, subida programada.',
  },
];

interface Props {
  draft: ChannelDraft;
}

/**
 * First video timeline — Liquid Glass refresh 2026-05-27.
 *
 * Hero card del canal + form crear carpeta + timeline de fases informativas
 * (la implementación real está aún por integrar al kanban del canal).
 */
export function FirstVideoTimeline({ draft }: Props) {
  const [workingTitle, setWorkingTitle] = useState('Primer vídeo');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ videoDir: string; channelRoot: string } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);

  async function createFolder() {
    setErr(null);
    setCreating(true);
    try {
      const r = await fetch(`/api/lab/channels/${draft.id}/first-video`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workingTitle: workingTitle.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCreated({ videoDir: j.videoDir, channelRoot: j.channelRoot });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header del canal */}
      <div
        className="glass rounded-[28px] border border-green-500/30 bg-green-500/8 p-5"
        style={{ boxShadow: '0 0 24px -8px rgba(34,197,94,0.30)' }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-green-500/40 bg-green-500/15 text-green-300">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-label text-green-300/80">
              Canal bootstrappeado
            </p>
            <h2 className="font-display text-xl font-semibold tracking-display text-white">
              {draft.bootstrap?.chosenName ?? '(canal sin nombre)'}
            </h2>
            <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-400">
              {draft.bootstrap?.diskPath ?? 'H:/YOUTUBE/<canal>'}
            </p>
          </div>
        </div>
      </div>

      {!created && (
        <div className="glass rounded-[24px] p-5">
          <h3 className="font-display text-base font-medium tracking-display text-white">
            Crear carpeta del primer vídeo
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
            Crea{' '}
            <code className="font-mono text-fuchsia-300">
              _EN PRODUCCIÓN/&lt;título&gt;/
            </code>{' '}
            con la convención estándar (01_BRUTOS, RENDER, _PACKAGING/MINIATURAS).
            Si el guion style-locked existe en el draft, se copia como{' '}
            <code className="font-mono text-fuchsia-300">guion-style-locked.md</code>.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={workingTitle}
              onChange={(e) => setWorkingTitle(e.target.value)}
              placeholder="Título tentativo del vídeo"
              className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none"
            />
            <button
              type="button"
              onClick={createFolder}
              disabled={creating || workingTitle.trim().length < 3}
              className={
                workingTitle.trim().length < 3
                  ? 'inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-600'
                  : 'inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-4 py-2 text-sm font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30'
              }
              style={
                workingTitle.trim().length >= 3
                  ? {
                      boxShadow:
                        'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 16px -4px rgba(217,70,239,0.45)',
                    }
                  : undefined
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {creating ? 'Creando…' : 'Crear carpeta'}
            </button>
          </div>
          {err && (
            <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
              <span className="font-medium">Error:</span> {err}
            </div>
          )}
        </div>
      )}

      {created && (
        <div
          className="glass rounded-[24px] border border-green-500/40 bg-green-500/10 p-5"
          style={{ boxShadow: '0 0 24px -8px rgba(34,197,94,0.35)' }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-green-500/40 bg-green-500/15 text-green-300">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-medium tracking-display text-green-200">
                Carpeta creada
              </h3>
              <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">
                {created.videoDir}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            Próximo paso manual: añade el canal{' '}
            <code className="font-mono text-fuchsia-300">
              {draft.bootstrap?.chosenName}
            </code>{' '}
            a{' '}
            <code className="font-mono text-fuchsia-300">lib/channels.ts</code>{' '}
            con su slug, paths y estados. Una vez registrado, el vídeo aparecerá
            en el kanban y puedes disparar las skills desde el modal de detalle.
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Fases del primer vídeo (timeline informativa)
        </h3>
        <ol className="space-y-2">
          {PHASES.map((p) => (
            <li
              key={p.index}
              className="glass flex items-start gap-4 rounded-2xl p-4"
            >
              {/* Numerales neutros (zinc) + forma cuadrada: deliberadamente
                  distintos de los badges fuchsia/redondos del wizard, para que
                  esta timeline informativa no se lea como un 6º paso del wizard. */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400">
                <span className="nums font-mono text-sm font-semibold">
                  {p.index}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-medium tracking-display text-white">
                  {p.title}
                </div>
                <div className="mt-0.5 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                  {p.skills}
                </div>
                <div className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  {p.blurb}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
          LAB v1 limita esta vista a creación de carpeta + listado informativo.
          La integración con el modal de vídeo (lanzar skills inline) requiere
          registrar el canal en lib/channels.ts y se hace tras añadir el slug.
        </p>
      </div>
    </div>
  );
}
