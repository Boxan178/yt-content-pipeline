'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CadenceRow, type CadenceChannel, type CadenceCfg } from './CadenceRow';

interface ExploredIdea {
  title: string;
  description: string;
  angle?: string;
  whyItWorks?: string;
  sourceVideoTitle?: string;
  sourceVideoUrl?: string;
  tags?: string[];
  priority?: number;
}

interface Props {
  channelSlug: string;
  channelName: string;
  onClose: () => void;
  /** Se llama tras añadir ideas para refrescar el kanban. */
  onIdeasAdded: (count: number) => void;
}

type Phase = 'idle' | 'running' | 'done' | 'failed';
const POLL_MS = 3000;

export function ExploreIdeasModal({ channelSlug, channelName, onClose, onIdeasAdded }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState(8);
  const [jobId, setJobId] = useState<string | null>(null);
  const [tail, setTail] = useState('');
  const [ideas, setIdeas] = useState<ExploredIdea[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form manual
  const [manual, setManual] = useState({ title: '', description: '', tags: '' });

  // Cadencia de publicación del canal (misma store que el calendario)
  const [cadence, setCadence] = useState<CadenceChannel | null>(null);
  const [cadenceSaved, setCadenceSaved] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Carga la cadencia actual del canal para el editor inline (fase idle).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/calendar/cadence', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok) return;
        const ch = (d.channels as CadenceChannel[]).find((c) => c.slug === channelSlug);
        if (ch) setCadence(ch);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelSlug]);

  const saveCadence = useCallback(async (patch: CadenceCfg) => {
    setCadenceSaved(false);
    try {
      const r = await fetch('/api/calendar/cadence', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (d?.ok) {
        // Actualiza el registro guardado para que CadenceRow recalcule "dirty"
        // (botón Guardar pasa a deshabilitado) sin remontar el componente.
        setCadence((prev) => (prev ? { ...prev, cadence: d.cadence } : prev));
        setCadenceSaved(true);
      }
    } catch {
      // best-effort; el botón Guardar sigue disponible para reintentar
    }
  }, []);

  const launch = async () => {
    setError(null);
    setIdeas([]);
    setSelected(new Set());
    setPhase('running');
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/ideas/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, focus: focus.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setJobId(data.job.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('failed');
    }
  };

  // Polling del job de exploración
  useEffect(() => {
    if (!jobId || phase !== 'running') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/channels/${encodeURIComponent(channelSlug)}/ideas/explore/${encodeURIComponent(jobId)}`,
        );
        const data = await r.json();
        if (cancelled) return;
        if (data.ok) {
          setTail(data.tail || '');
          const status = data.job?.status as string | undefined;
          if (status && status !== 'running') {
            const hasIdeas = Array.isArray(data.parsed) && data.parsed.length > 0;
            if (hasIdeas) {
              setIdeas(data.parsed as ExploredIdea[]);
              setSelected(new Set((data.parsed as ExploredIdea[]).map((_, i) => i)));
              setPhase('done');
            } else if (data.jobError) {
              // El job reventó (típico: 401 de auth). Mensaje útil, no "no parseé".
              setError(authHint(String(data.jobError)));
              setPhase('failed');
            } else if (status !== 'done') {
              setError(`El job terminó como "${status}".`);
              setPhase('failed');
            } else {
              // Terminó OK pero sin bloque IDEAS_JSON parseable.
              setPhase('done');
            }
            return; // detener polling
          }
        }
      } catch {
        // reintenta
      }
      if (!cancelled) pollTimer.current = setTimeout(poll, POLL_MS);
    };
    pollTimer.current = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [jobId, phase, channelSlug, stopPolling]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const addSelected = async () => {
    const chosen = ideas.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideas: chosen.map((c) => ({
            title: c.title,
            description: [c.description, c.angle ? `Ángulo: ${c.angle}` : '', c.whyItWorks ? `Por qué funciona: ${c.whyItWorks}` : '']
              .filter(Boolean)
              .join('\n\n'),
            tags: Array.isArray(c.tags) ? c.tags : [],
            priority: typeof c.priority === 'number' ? Math.min(Math.max(Math.round(c.priority), 1), 5) : 3,
            sourceVideoTitle: c.sourceVideoTitle || null,
            sourceVideoUrl: c.sourceVideoUrl || null,
          })),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      onIdeasAdded(data.count ?? chosen.length);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAdding(false);
    }
  };

  const addManual = async () => {
    if (manual.title.trim().length < 3 || manual.description.trim().length < 5) return;
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manual.title.trim(),
          description: manual.description.trim(),
          tags: manual.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      onIdeasAdded(data.count ?? 1);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="glass-premium flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-display text-white">Explorar ideas</h2>
            <p className="text-xs text-zinc-400">{channelName} · MARIO explora el mercado y propone ideas nuevas con el packaging correcto</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-400 hover:text-white">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Configuración + lanzar */}
          {phase === 'idle' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-label text-zinc-500">Enfoque (opcional)</label>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="p.ej. centrarte en ansiedad / hábitos, o dejar libre"
                  className={INPUT_CLS}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[11px] uppercase tracking-label text-zinc-500">Nº de ideas</label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className={`${INPUT_CLS} w-24`}
                />
              </div>

              {/* Cadencia de publicación — mismo control y store que el calendario */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[11px] uppercase tracking-label text-zinc-500">Cadencia de publicación</label>
                  {cadenceSaved && <span className="text-[10px] text-emerald-400">✓ guardada</span>}
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
                  Cada cuánto publicar en este canal y en qué días (p. ej. 7/sem = 1 al día; 6/sem y marca los días
                  preferidos para descansar uno). Es la misma cadencia que el calendario usa para repartir fechas y
                  avisar de huecos.
                </p>
                {cadence ? (
                  <CadenceRow ch={cadence} onSave={saveCadence} />
                ) : (
                  <p className="text-[11px] text-zinc-600">Cargando cadencia…</p>
                )}
              </div>

              <button onClick={launch} className="btn-gold w-full justify-center">
                Explorar el mercado y proponer ideas
              </button>

              {/* Alta manual */}
              <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <summary className="cursor-pointer text-sm text-zinc-300">…o añadir una idea manualmente</summary>
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Título (mín 3 chars)"
                    value={manual.title}
                    onChange={(e) => setManual({ ...manual, title: e.target.value })}
                    className={INPUT_CLS}
                  />
                  <textarea
                    placeholder="Descripción (mín 5 chars)"
                    value={manual.description}
                    onChange={(e) => setManual({ ...manual, description: e.target.value })}
                    rows={3}
                    className={INPUT_CLS}
                  />
                  <input
                    type="text"
                    placeholder="Tags (separados por coma)"
                    value={manual.tags}
                    onChange={(e) => setManual({ ...manual, tags: e.target.value })}
                    className={INPUT_CLS}
                  />
                  <button
                    onClick={addManual}
                    disabled={adding || manual.title.trim().length < 3 || manual.description.trim().length < 5}
                    className="btn-glass w-full justify-center disabled:opacity-50"
                  >
                    {adding ? 'Añadiendo…' : 'Añadir idea manual'}
                  </button>
                </div>
              </details>
            </div>
          )}

          {/* Job corriendo */}
          {phase === 'running' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
                MARIO está explorando el mercado para {channelName}… (puede tardar unos minutos)
              </div>
              {tail && (
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-3 text-[10px] leading-relaxed text-zinc-400">
                  {tail.slice(-3000)}
                </pre>
              )}
            </div>
          )}

          {/* Resultados */}
          {phase === 'done' && (
            <div className="space-y-3">
              {ideas.length === 0 ? (
                <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-300">
                  El job terminó pero MARIO no devolvió un bloque IDEAS_JSON parseable. Revisa el log del job en /queue (puede haber tardado o cortado la salida) y vuelve a intentarlo.
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-300">
                    {ideas.length} ideas propuestas · {selected.size} seleccionadas
                  </p>
                  <ul className="space-y-2">
                    {ideas.map((idea, i) => (
                      <li
                        key={i}
                        onClick={() => toggle(i)}
                        className={`cursor-pointer rounded-2xl border p-3 transition ${
                          selected.has(i)
                            ? 'border-fuchsia-500/50 bg-fuchsia-500/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selected.has(i)}
                            onChange={() => toggle(i)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 h-4 w-4 cursor-pointer rounded border-white/20 bg-white/10 accent-fuchsia-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-display text-sm font-medium text-white">{idea.title}</span>
                              {typeof idea.priority === 'number' && (
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">
                                  P{Math.min(Math.max(Math.round(idea.priority), 1), 5)}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{idea.description}</p>
                            {idea.angle && <p className="mt-1 text-[11px] text-zinc-500">Ángulo: {idea.angle}</p>}
                            {idea.sourceVideoTitle && (
                              <p className="mt-1 text-[10px] text-zinc-500">↗ patrón de mercado: {idea.sourceVideoTitle}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {phase === 'failed' && ideas.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
                No se pudieron generar ideas. {error}
              </div>
              <button onClick={launch} className="btn-gold w-full justify-center">
                ↻ Reintentar exploración
              </button>
            </div>
          )}
        </div>

        {phase === 'done' && ideas.length > 0 && (
          <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
            <button
              onClick={() => setSelected(selected.size === ideas.length ? new Set() : new Set(ideas.map((_, i) => i)))}
              className="text-xs text-zinc-400 hover:text-white"
            >
              {selected.size === ideas.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
            <button onClick={addSelected} disabled={adding || selected.size === 0} className="btn-gold disabled:opacity-50">
              {adding ? 'Añadiendo…' : `Añadir ${selected.size} a Ideas`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

const INPUT_CLS =
  'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none';

/** Convierte el error crudo del job en un mensaje accionable. */
function authHint(raw: string): string {
  if (/401|authentication_error|Invalid authentication credentials/i.test(raw)) {
    return 'El proceso de Claude no pudo autenticarse (401). El `claude` que lanza el pipeline debe usar tu suscripción Pro. Reabre sesión de Claude en el PC (ejecuta `claude` y vuelve a loguearte si hace falta) y reintenta. Detalle: ' + raw.slice(0, 200);
  }
  return 'El job falló: ' + raw.slice(0, 300);
}
