'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VideoCardData } from './VideoCard';
import {
  buildElenaAudit,
  buildSaraResume,
  buildLuisRender,
  buildNoraIris,
  buildCaliopeFullAudio,
  buildMarcoAurelioRewrite,
  withExtraInstructions,
  type VideoContext,
} from '@/lib/prompts';

type SkillKey = 'sara' | 'elena' | 'luis' | 'nora-iris' | 'caliope' | 'marco-aurelio';

interface SkillSpec {
  key: SkillKey;
  label: string;
  short: string;
  requirement?: (v: VideoCardData) => string | undefined;
}

const SKILLS: SkillSpec[] = [
  { key: 'sara', label: 'SARA · Retomar pipeline', short: 'SARA' },
  {
    key: 'elena',
    label: 'ELENA · Auditar guion',
    short: 'ELENA',
    requirement: (v) => v.progress.details.scriptWritten ? undefined : 'sin guion',
  },
  {
    key: 'luis',
    label: 'LUIS · Editar vídeo',
    short: 'LUIS',
    requirement: (v) => {
      if (!v.progress.details.locucionReady) return 'sin locución';
      if (!v.progress.details.scriptWritten) return 'sin guion';
      return undefined;
    },
  },
  { key: 'nora-iris', label: 'NORA + IRIS · Miniatura', short: 'NORA+IRIS' },
  { key: 'caliope', label: 'CALIOPE · Locución TTS', short: 'CALIOPE' },
  {
    key: 'marco-aurelio',
    label: 'MARCO AURELIO · Reescribir guion',
    short: 'MARCO AURELIO',
    requirement: (v) => v.progress.details.scriptWritten ? undefined : 'no aplica sin guion previo',
  },
];

interface Props {
  channelSlug: string;
  channelName: string;
  videos: VideoCardData[];
  onClose: () => void;
  onEnqueued: (count: number) => void;
}

export function BulkEnqueueModal({ channelSlug, channelName, videos, onClose, onEnqueued }: Props) {
  const [skill, setSkill] = useState<SkillKey>('luis');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extraInstructions, setExtraInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const skillSpec = useMemo(() => SKILLS.find((s) => s.key === skill)!, [skill]);

  const enriched = useMemo(() => {
    return videos
      // Los archivados NO se encolan (eran ruido en la lista). Tampoco los
      // subidos: la cola es para avanzar vídeos en producción.
      .filter((v) => v.state !== 'archived' && v.state !== 'uploaded')
      .map((v) => ({
        v,
        blocker: skillSpec.requirement?.(v),
      }))
      .sort((a, b) => {
        // Primero los que no tienen blocker, luego los demás
        const ka = a.blocker ? 1 : 0;
        const kb = b.blocker ? 1 : 0;
        if (ka !== kb) return ka - kb;
        return a.v.title.localeCompare(b.v.title, 'es');
      });
  }, [videos, skillSpec]);

  const toggle = (folder: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder); else next.add(folder);
      return next;
    });
  };

  const selectAllEligible = () => {
    const elegibles = enriched.filter((e) => !e.blocker).map((e) => e.v.folderPath.replace(/\\/g, '/'));
    setPicked(new Set(elegibles));
  };
  const clearAll = () => setPicked(new Set());

  const enqueue = async () => {
    if (picked.size === 0) {
      setError('Selecciona al menos un vídeo');
      return;
    }
    setBusy(true);
    setError(null);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const e of enriched) {
      const folder = e.v.folderPath.replace(/\\/g, '/');
      if (!picked.has(folder)) continue;
      if (e.blocker) {
        // Saltamos los bloqueados
        continue;
      }
      const ctx: VideoContext = {
        channel: e.v.channel,
        title: e.v.title,
        state: e.v.state,
        folderPath: e.v.folderPath,
        progress: {
          hits: e.v.progress.hits,
          total: e.v.progress.total,
          percent: e.v.progress.percent,
          details: e.v.progress.details,
        },
      };
      let built;
      switch (skill) {
        case 'sara': built = buildSaraResume(ctx); break;
        case 'elena': built = buildElenaAudit(ctx); break;
        case 'luis': built = buildLuisRender(ctx); break;
        case 'nora-iris': built = buildNoraIris(ctx); break;
        case 'caliope': built = buildCaliopeFullAudio(ctx); break;
        case 'marco-aurelio': built = buildMarcoAurelioRewrite(ctx); break;
      }
      built = withExtraInstructions(built!, extraInstructions);
      try {
        const r = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skill: skillSpec.short.toLowerCase().replace(/[^a-z]/g, '-'),
            label: `${skillSpec.short} · ${e.v.title}`,
            videoFolder: folder,
            videoTitle: e.v.title,
            prompt: built.prompt,
            cwd: built.cwd,
            timeoutMs: built.timeoutMs,
            model: built.model,
          }),
        });
        const data = await r.json();
        if (!r.ok || !data.ok) {
          failed++;
          errors.push(`${e.v.title}: ${data.error || r.status}`);
        } else {
          ok++;
        }
      } catch (err) {
        failed++;
        errors.push(`${e.v.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setBusy(false);
    if (failed > 0) {
      setError(`${ok} encolados, ${failed} fallidos. Primer error: ${errors[0]}`);
    }
    if (ok > 0) {
      onEnqueued(ok);
      // Cerrar tras 1.5s si todo OK
      if (failed === 0) setTimeout(onClose, 800);
    }
  };

  const eligibleCount = enriched.filter((e) => !e.blocker).length;
  const pickedEligible = enriched.filter((e) => !e.blocker && picked.has(e.v.folderPath.replace(/\\/g, '/'))).length;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold text-white">📋 Encolar lote · {channelName}</h2>
          <button
            onClick={onClose}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white"
          >
            ✕ Cerrar
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
              Skill a aplicar a TODOS los seleccionados
            </label>
            <select
              value={skill}
              onChange={(e) => { setSkill(e.target.value as SkillKey); setPicked(new Set()); }}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white"
            >
              {SKILLS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted">
              Cada item se encolará secuencialmente — la cola los procesa uno detrás de otro. Items que no cumplen requisitos (sin guion, sin locución, etc.) se saltan.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
              Instrucciones adicionales <span className="font-normal lowercase tracking-normal text-zinc-500">(opcional)</span>
            </label>
            <textarea
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              rows={3}
              placeholder="Ej: Cierra el pipeline completo (miniaturas, títulos, todo) PERO no audites ni reescribas el guion, ni relances la locución — déjalos tal cual están."
              className="w-full resize-y rounded border border-border bg-bg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            />
            <p className="mt-1 text-[10px] text-muted">
              Esta frase se inyecta como instrucción prioritaria en el prompt de TODOS los vídeos seleccionados, aplicada a todas las fases del proceso.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wider text-muted">
                Selecciona vídeos · {pickedEligible} marcados (de {eligibleCount} elegibles)
              </span>
              <div className="flex gap-1.5">
                <button onClick={selectAllEligible} className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted hover:text-white">
                  Todos elegibles
                </button>
                <button onClick={clearAll} className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted hover:text-white">
                  Ninguno
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto rounded border border-border bg-bg/40">
              {enriched.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted">
                  No hay vídeos en producción en este canal. (Las ideas se lanzan con “Empezar cola” en la columna Ideas, no aquí.)
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {enriched.map(({ v, blocker }) => {
                    const folder = v.folderPath.replace(/\\/g, '/');
                    const isPicked = picked.has(folder);
                    return (
                      <li key={folder} className={blocker ? 'opacity-50' : ''}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-bg/60">
                          <input
                            type="checkbox"
                            checked={isPicked}
                            disabled={!!blocker}
                            onChange={() => toggle(folder)}
                            className="h-4 w-4 cursor-pointer"
                          />
                          <span className="flex-1 truncate text-sm text-zinc-200">{v.title}</span>
                          <span className="shrink-0 text-[10px] text-muted">{v.state}</span>
                          {blocker && (
                            <span className="shrink-0 rounded border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] text-yellow-300">
                              {blocker}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-bg/40 px-5 py-3">
          <p className="text-[10px] text-muted">
            La cola procesa items uno a uno. Sigue su estado en <span className="text-zinc-300">/queue</span>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded border border-border bg-bg px-3 py-1.5 text-sm text-muted hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={enqueue}
              disabled={busy || pickedEligible === 0}
              className="rounded border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              {busy ? 'Encolando…' : `📋 Encolar ${pickedEligible} item${pickedEligible !== 1 ? 's' : ''}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
