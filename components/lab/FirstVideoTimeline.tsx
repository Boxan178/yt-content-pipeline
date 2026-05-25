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

export function FirstVideoTimeline({ draft }: Props) {
  const [workingTitle, setWorkingTitle] = useState('Primer vídeo');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ videoDir: string; channelRoot: string } | null>(null);
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
      <div className="rounded-md border border-emerald-700/40 bg-emerald-900/10 p-4">
        <h2 className="text-base font-bold text-emerald-200">
          🎬 {draft.bootstrap?.chosenName ?? '(canal sin nombre)'}
        </h2>
        <p className="text-xs text-emerald-100/70">
          Path: <code className="font-mono">{draft.bootstrap?.diskPath ?? 'H:/YOUTUBE/<canal>'}</code>
        </p>
      </div>

      {!created && (
        <div className="rounded-md border border-border bg-panel/40 p-4">
          <h3 className="text-sm font-semibold text-white">Crear carpeta del primer vídeo</h3>
          <p className="mt-1 text-xs text-zinc-400">
            Crea <code className="font-mono">_EN PRODUCCIÓN/&lt;título&gt;/</code> con la
            convención estándar (01_BRUTOS, RENDER, _PACKAGING/MINIATURAS). Si el guion
            style-locked existe en el draft, se copia como{' '}
            <code className="font-mono">guion-style-locked.md</code>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={workingTitle}
              onChange={(e) => setWorkingTitle(e.target.value)}
              placeholder="Título tentativo del vídeo"
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
            />
            <button
              type="button"
              onClick={createFolder}
              disabled={creating || workingTitle.trim().length < 3}
              className={`rounded-md border px-4 py-2 text-sm font-semibold ${
                workingTitle.trim().length < 3
                  ? 'cursor-not-allowed border-border bg-panel text-zinc-600'
                  : 'border-accent/60 bg-accent/20 text-accent hover:bg-accent/30'
              }`}
            >
              {creating ? 'Creando…' : 'Crear carpeta'}
            </button>
          </div>
          {err && (
            <div className="mt-2 rounded border border-red-700/60 bg-red-900/20 p-2 text-xs text-red-300">
              Error: {err}
            </div>
          )}
        </div>
      )}

      {created && (
        <div className="rounded-md border border-emerald-700/40 bg-emerald-900/10 p-4">
          <h3 className="text-sm font-semibold text-emerald-200">
            ✅ Carpeta creada
          </h3>
          <p className="mt-1 text-xs text-emerald-100/80">
            <code className="font-mono">{created.videoDir}</code>
          </p>
          <p className="mt-3 text-xs text-emerald-100/70">
            Próximo paso manual: añade el canal{' '}
            <code className="font-mono">{draft.bootstrap?.chosenName}</code> a{' '}
            <code className="font-mono">lib/channels.ts</code> con su slug, paths y
            estados. Una vez registrado, el vídeo aparecerá en el kanban y puedes
            disparar las skills desde el modal de detalle.
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Fases del primer vídeo (timeline informativa)
        </h3>
        <ol className="space-y-2">
          {PHASES.map((p) => (
            <li
              key={p.index}
              className="flex items-start gap-3 rounded-md border border-border bg-panel/40 p-3"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-xs font-semibold text-zinc-300">
                {p.index}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{p.title}</div>
                <div className="text-[11px] text-zinc-500">{p.skills}</div>
                <div className="mt-1 text-xs text-zinc-400">{p.blurb}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[10px] text-zinc-600">
          LAB v1 limita esta vista a creación de carpeta + listado informativo. La
          integración con el modal de vídeo (lanzar skills inline) requiere
          registrar el canal en lib/channels.ts y se hace tras añadir el slug.
        </p>
      </div>
    </div>
  );
}
